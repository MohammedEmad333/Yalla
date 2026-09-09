package com.mohammedemad333.yalla

import android.os.Bundle
import androidx.core.view.WindowCompat
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // FlutterActivity ليست ComponentActivity، لذا نفعّل Edge-to-Edge عبر
        // WindowCompat مباشرةً قبل إنشاء واجهة Flutter.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        super.onCreate(savedInstanceState)
    }
}
