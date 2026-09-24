import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';

/// Lightweight runtime performance diagnostics.
///
/// Enabled only in debug/profile builds, so release users pay no frame logging
/// or timing overhead. Slow/janky frames are surfaced in DevTools/logcat.
class PerformanceMonitor {
  PerformanceMonitor._();

  static bool _started = false;
  static int _frameCount = 0;
  static int _slowFrameCount = 0;
  static int _jankyFrameCount = 0;
  static int _worstFrameMicros = 0;

  static bool get enabled => kDebugMode || kProfileMode;

  static void start() {
    if (!enabled || _started) return;
    _started = true;
    SchedulerBinding.instance.addTimingsCallback(_onTimings);
    developer.log('Performance monitor started', name: 'Yalla.Perf');
  }

  static void stop() {
    if (!_started) return;
    SchedulerBinding.instance.removeTimingsCallback(_onTimings);
    _started = false;
  }

  static void _onTimings(List<FrameTiming> timings) {
    for (final timing in timings) {
      _frameCount += 1;
      final total = timing.totalSpan.inMicroseconds;
      if (total > _worstFrameMicros) _worstFrameMicros = total;

      if (total > 16667) _slowFrameCount += 1;
      if (total > 33334) {
        _jankyFrameCount += 1;
        developer.log(
          'Janky frame: \${(total / 1000).toStringAsFixed(1)}ms '
          '(build \${(timing.buildDuration.inMicroseconds / 1000).toStringAsFixed(1)}ms, '
          'raster \${(timing.rasterDuration.inMicroseconds / 1000).toStringAsFixed(1)}ms)',
          name: 'Yalla.Perf',
        );
      }

      if (_frameCount % 120 == 0) {
        developer.log(
          'Frames=\$_frameCount slow=\$_slowFrameCount '
          'janky=\$_jankyFrameCount worst=\${(_worstFrameMicros / 1000).toStringAsFixed(1)}ms',
          name: 'Yalla.Perf',
        );
      }
    }
  }
}
