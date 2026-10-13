/// Human-friendly guidance for read-only requests when connectivity is lost.
String networkFailureMessage({bool timedOut = false}) => timedOut
    ? 'انتهت مهلة الاتصال. تحقق من الإنترنت وحاول التحديث مجددًا.'
    : 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجددًا.';

/// Writes may have reached the server even when the response was lost.
/// Never imply that a payment/order request can safely be submitted again.
String writeNetworkFailureMessage({bool timedOut = false}) => timedOut
    ? 'انتهت مهلة الاتصال. قد تكون العملية نُفذت؛ تحقق من حالتها قبل إعادة المحاولة.'
    : 'انقطع الاتصال. قد تكون العملية نُفذت؛ تحقق من حالتها قبل إعادة المحاولة.';
