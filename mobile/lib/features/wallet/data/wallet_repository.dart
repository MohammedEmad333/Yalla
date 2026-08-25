// طبقة بيانات المحفظة — تغلّف نداءات الـ API الخاصّة بالرصيد والشحن.
// تفصل شاشات الواجهة عن تفاصيل المسارات، فتبقى الشاشات نظيفة وقابلة للاختبار.

import '../../../core/network/api_client.dart';

class WalletRepository {
  final ApiClient _api;
  WalletRepository(this._api);

  // رصيد المحفظة الحالي: { balance, currency }
  Future<Map<String, dynamic>> getBalance() async {
    final data = await _api.get('/wallet');
    return Map<String, dynamic>.from(data as Map);
  }

  // طرق الشحن المتاحة (بيانات الحساب + التعليمات)
  Future<List<dynamic>> getMethods() async {
    final data = await _api.get('/wallet/methods');
    return data as List;
  }

  // سجلّ حركات المحفظة
  Future<List<dynamic>> getTransactions() async {
    final data = await _api.get('/wallet/transactions');
    return data as List;
  }

  // إرسال طلب شحن مع صورة الإيصال (multipart).
  // [method] مفتاح الطريقة، [amount] المبلغ، [referenceNumber] رقم العملية،
  // [receiptPath] مسار صورة الإيصال المحلّي (اختياري إن اكتُفي برقم العملية).
  Future<Map<String, dynamic>> submitTopup({
    required String method,
    required int amount,
    String? referenceNumber,
    String? senderName,
    String? receiptPath,
  }) async {
    final data = await _api.postMultipart(
      '/wallet/topup',
      fields: {
        'method': method,
        'amount': amount.toString(),
        if (referenceNumber != null && referenceNumber.isNotEmpty)
          'referenceNumber': referenceNumber,
        if (senderName != null && senderName.isNotEmpty) 'senderName': senderName,
      },
      filePath: receiptPath,
      fileField: 'receipt', // يطابق uploadReceipt.single('receipt') في الخادم
    );
    return Map<String, dynamic>.from(data as Map);
  }

  // Card 98: الرصيد المتاح للسحب + هل يوجد طلب جارٍ يمنع السحب (Card 99)
  // { balance, pending, available, currency, hasActiveOrder }
  Future<Map<String, dynamic>> getWithdrawAvailability() async {
    final data = await _api.get('/wallet/withdrawals/available');
    return Map<String, dynamic>.from(data as Map);
  }

  // Card 98: سجلّ طلبات سحب الرصيد
  Future<List<dynamic>> getWithdrawals() async {
    final data = await _api.get('/wallet/withdrawals');
    return data as List;
  }

  // Card 98: طلب سحب رصيد إلى محفظة إلكترونية أو بنك يذكره الزبون
  Future<Map<String, dynamic>> requestWithdrawal({
    required int amount,
    required String destination,
    required String accountNumber,
    String? accountOwner,
    String? note,
  }) async {
    final data = await _api.post('/wallet/withdrawals', {
      'amount': amount,
      'destination': destination,
      'accountNumber': accountNumber,
      if (accountOwner != null && accountOwner.isNotEmpty) 'accountOwner': accountOwner,
      if (note != null && note.isNotEmpty) 'note': note,
    });
    return Map<String, dynamic>.from(data as Map);
  }
}
