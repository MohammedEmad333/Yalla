import 'dart:js_interop';

@JS('yallaSetInstallEligible')
external JSFunction? get _setEligible;

void setInstallBannerEligible(bool signedIn) {
  // Older web shells and widget tests may not provide the optional banner.
  _setEligible?.callAsFunction(null, signedIn.toJS);
}
