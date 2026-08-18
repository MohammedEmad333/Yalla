#!/usr/bin/env python3
"""حقن إعداد توقيع الإصدار (release signing) في android/app/build.gradle المولَّد.

`flutter create` يولّد build.gradle يوقّع الإصدار بمفتاح debug — وهو ما يرفضه
Google Play. هذا السكربت يضيف بشكل متسامح (يدعم صيغتَي Groovy القديمة والجديدة):
  1) تحميل قيم التوقيع من android/key.properties.
  2) كتلة signingConfigs.release تقرأ tthat keystore.
  3) تحويل buildTypes.release لاستخدام signingConfigs.release بدل debug.

يُشغَّل من مجلّد mobile/:  python3 tool/inject_signing.py
يفشل بوضوح إن لم يجد المواضع المتوقّعة — حتى لا يُبنى إصدار موقّع بمفتاح debug صامتًا.
"""
import re
import sys
from pathlib import Path

GRADLE = Path("android/app/build.gradle")
GRADLE_KTS = Path("android/app/build.gradle.kts")

LOADER = """
// ── توقيع الإصدار (Yalla) — تُحقَن بواسطة tool/inject_signing.py ──
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

"""

SIGNING_BLOCK = """
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties['keyAlias']
                keyPassword = keystoreProperties['keyPassword']
                storeFile = keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
                storePassword = keystoreProperties['storePassword']
            }
        }
    }
"""


def fail(msg: str) -> None:
    print(f"inject_signing: خطأ — {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if GRADLE_KTS.exists() and not GRADLE.exists():
        fail(
            "الملف build.gradle.kts (Kotlin DSL) غير مدعوم في هذا السكربت؛ "
            "ثبّت إصدار Flutter الذي يولّد build.gradle (Groovy) أو حدّث السكربت."
        )
    if not GRADLE.exists():
        fail(f"لم يُعثر على {GRADLE} — شغّل `flutter create` أوّلًا.")

    text = GRADLE.read_text(encoding="utf-8")

    if "signingConfigs.release" in text and "keystorePropertiesFile" in text:
        print("inject_signing: التوقيع مُحقَن مسبقًا — تخطّي.")
        return

    # 1) تحميل key.properties قبل كتلة android {
    m = re.search(r"^android\s*\{", text, flags=re.MULTILINE)
    if not m:
        fail("لم يُعثر على كتلة `android {` في build.gradle.")
    text = text[: m.start()] + LOADER + text[m.start() :]

    # 2) كتلة signingConfigs مباشرة بعد فتح `android {`
    m = re.search(r"^android\s*\{[^\n]*\n", text, flags=re.MULTILINE)
    if not m:
        fail("تعذّر تحديد سطر فتح `android {`.")
    text = text[: m.end()] + SIGNING_BLOCK + text[m.end() :]

    # 3) تحويل توقيع الإصدار من debug إلى release
    #    يدعم: `signingConfig signingConfigs.debug` و`signingConfig = signingConfigs.debug`
    new_text, n = re.subn(
        r"signingConfig\s*=?\s*signingConfigs\.debug",
        "signingConfig = signingConfigs.release",
        text,
    )
    if n == 0:
        fail(
            "لم يُعثر على `signingConfig signingConfigs.debug` داخل buildTypes.release — "
            "تحقّق من صيغة build.gradle المولَّد."
        )
    text = new_text

    GRADLE.write_text(text, encoding="utf-8")
    print(f"inject_signing: تمّ حقن توقيع الإصدار في {GRADLE} ({n} موضع تحويل).")


if __name__ == "__main__":
    main()
