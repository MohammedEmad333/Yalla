/// Human-friendly guidance for read-only requests when connectivity is lost.
String networkFailureMessage({bool timedOut = false}) => timedOut
    ? 'انتهت مهلة الاتصال. تحقق من الإنترنت وحاول التحديث مجددًا.'
    : 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجددًا.';
