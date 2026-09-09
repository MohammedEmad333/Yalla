package com.mohammedemad333.yalla

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // يفعّل العرض حتى حواف الشاشة على Android 15 والإصدارات الأقدم.
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
    }
}
