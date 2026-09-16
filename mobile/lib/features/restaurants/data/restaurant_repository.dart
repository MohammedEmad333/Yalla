// طبقة بيانات المطاعم (Card 110) — نماذج المطعم والصنف والسلّة + نداءات الـ API.
// تفصل الشاشات عن تفاصيل المسارات وشكل استجابة الخادم.

import '../../../core/config/app_config.dart';
import '../../../core/network/api_client.dart';

/// مطعم/متجر معروض في صفحة المطاعم.
class Restaurant {
  final String id;
  final String name;
  final String description;
  final String category;
  final String imageUrl;
  final String phone;
  final String city;
  final String neighborhood;
  final String address;
  final List<double>? coords; // [lng, lat] — نقطة الاستلام لحساب أجرة التوصيل
  final num minOrder;
  final num prepMinutes;
  final bool isOpen;
  final String openTime; // "HH:MM" أو '' (طوال اليوم)
  final String closeTime;
  final double ratingAverage;
  final int ratingCount;

  const Restaurant({
    required this.id,
    required this.name,
    required this.description,
    required this.category,
    required this.imageUrl,
    required this.phone,
    required this.city,
    required this.neighborhood,
    required this.address,
    required this.coords,
    required this.minOrder,
    required this.prepMinutes,
    required this.isOpen,
    required this.openTime,
    required this.closeTime,
    required this.ratingAverage,
    required this.ratingCount,
  });

  factory Restaurant.fromJson(Map<String, dynamic> json) {
    final raw = (json['location']?['coordinates'] as List?) ?? const [];
    final coords = raw.length == 2
        ? raw.map((n) => (n as num).toDouble()).toList(growable: false)
        : null;
    return Restaurant(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      category: (json['category'] ?? '').toString(),
      imageUrl: (json['imageUrl'] ?? '').toString(),
      phone: (json['phone'] ?? '').toString(),
      city: (json['city'] ?? '').toString(),
      neighborhood: (json['neighborhood'] ?? '').toString(),
      address: (json['address'] ?? '').toString(),
      coords: coords,
      minOrder: (json['minOrder'] as num?) ?? 0,
      prepMinutes: (json['prepMinutes'] as num?) ?? 0,
      isOpen: json['isOpen'] != false,
      openTime: (json['openTime'] ?? '').toString(),
      closeTime: (json['closeTime'] ?? '').toString(),
      ratingAverage: ((json['ratingAverage'] as num?) ?? 0).toDouble(),
      ratingCount: ((json['ratingCount'] as num?) ?? 0).toInt(),
    );
  }

  /// رابط صورة كامل (الصور المرفوعة تُخزَّن بمسار نسبي على الخادم).
  String? get fullImageUrl {
    if (imageUrl.isEmpty) return null;
    return imageUrl.startsWith('http') ? imageUrl : '${AppConfig.origin}$imageUrl';
  }

  // ── مواعيد العمل (Card 112) ──────────────────────────────────────────────
  // نحسب الحالة على الجهاز (توقيت المستخدم المحلّي) لتفادي فوارق المناطق الزمنيّة.

  static int? _minutes(String hhmm) {
    final m = RegExp(r'^(\d{1,2}):(\d{2})$').firstMatch(hhmm.trim());
    if (m == null) return null;
    final h = int.parse(m.group(1)!);
    final min = int.parse(m.group(2)!);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /// هل للمطعم مواعيد محدّدة صالحة؟ (وإلّا يُعتبر مفتوحًا طوال اليوم)
  bool get hasSchedule {
    final o = _minutes(openTime), c = _minutes(closeTime);
    return o != null && c != null && o != c;
  }

  bool get _withinSchedule {
    final o = _minutes(openTime), c = _minutes(closeTime);
    if (o == null || c == null || o == c) return true;
    final n = DateTime.now();
    final now = n.hour * 60 + n.minute;
    return c > o ? (now >= o && now < c) : (now >= o || now < c); // فترة تعبر منتصف الليل
  }

  /// مفتوح فعليًّا الآن = المفتاح اليدوي + ضمن المواعيد.
  bool get openNow => isOpen && _withinSchedule;

  // تنسيق دقائق اليوم إلى ١٢ ساعة عربيّة مختصرة، مثل «11ص» أو «9:30م».
  static String _fmt12(int minutes) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    final suffix = h < 12 ? 'ص' : 'م';
    var hr = h % 12;
    if (hr == 0) hr = 12;
    return m == 0 ? '$hr$suffix' : '$hr:${m.toString().padLeft(2, '0')}$suffix';
  }

  /// عبارة الموعد مثل «11ص - 11م»، أو '' إن بلا مواعيد.
  String get scheduleLabel {
    final o = _minutes(openTime), c = _minutes(closeTime);
    if (o == null || c == null || o == c) return '';
    return '${_fmt12(o)} - ${_fmt12(c)}';
  }

  /// عبارة تُعرض حين الإغلاق مثل «يفتح 9 صباحًا»، أو '' إن بلا مواعيد.
  String get opensAtLabel {
    final o = _minutes(openTime);
    if (o == null) return '';
    final h = o ~/ 60;
    final m = o % 60;
    final period = h < 12 ? 'صباحًا' : (h < 17 ? 'ظهرًا' : 'مساءً');
    var hr = h % 12;
    if (hr == 0) hr = 12;
    final t = m == 0 ? '$hr' : '$hr:${m.toString().padLeft(2, '0')}';
    return 'يفتح $t $period';
  }
}

/// صنف في قائمة مطعم.
class MenuItemModel {
  final String id;
  final String name;
  final String description;
  final String category;
  final String imageUrl;
  final num price;
  final bool available;
  final List<MenuVariant> variants;

  const MenuItemModel({
    required this.id,
    required this.name,
    required this.description,
    required this.category,
    required this.imageUrl,
    required this.price,
    required this.available,
    required this.variants,
  });

  factory MenuItemModel.fromJson(Map<String, dynamic> json) => MenuItemModel(
        id: (json['_id'] ?? json['id'] ?? '').toString(),
        name: (json['name'] ?? '').toString(),
        description: (json['description'] ?? '').toString(),
        category: (json['category'] ?? '').toString(),
        imageUrl: (json['imageUrl'] ?? '').toString(),
        price: (json['price'] as num?) ?? 0,
        available: json['available'] != false,
        variants: ((json['variants'] as List?) ?? const [])
            .map((v) => MenuVariant.fromJson(Map<String, dynamic>.from(v as Map)))
            .where((v) => v.label.isNotEmpty && v.price > 0)
            .toList(),
      );

  String? get fullImageUrl {
    if (imageUrl.isEmpty) return null;
    return imageUrl.startsWith('http') ? imageUrl : '${AppConfig.origin}$imageUrl';
  }
}

class MenuVariant {
  final String label;
  final num price;
  const MenuVariant(this.label, this.price);
  factory MenuVariant.fromJson(Map<String, dynamic> json) =>
      MenuVariant((json['label'] ?? '').toString(), (json['price'] as num?) ?? 0);
}

/// قسم في القائمة (ساندويشات، مشروبات...) مع أصنافه.
class MenuSection {
  final String category;
  final List<MenuItemModel> items;
  const MenuSection(this.category, this.items);
}

/// سطر في السلّة: صنف + كمّية.
class CartLine {
  final MenuItemModel item;
  final MenuVariant? variant;
  int qty;
  CartLine(this.item, this.qty, {this.variant});
  num get unitPrice => variant?.price ?? item.price;
  num get total => unitPrice * qty;
  String get label => variant == null ? item.name : '${item.name} (${variant!.label})';
}

/// سلّة مطعم واحد — تُبنى في شاشة القائمة وتُمرَّر لشاشة إتمام الطلب.
class Cart {
  final Restaurant restaurant;
  final Map<String, CartLine> lines = {};
  Cart(this.restaurant);

  int qtyOf(String itemId) => lines[itemId]?.qty ?? 0;
  bool get isEmpty => lines.isEmpty;

  /// عدد القطع الكلّي (لا عدد الأصناف) — يظهر على شريط السلّة.
  int get count => lines.values.fold(0, (sum, l) => sum + l.qty);

  /// قيمة الأصناف بالشيكل (بلا أجرة التوصيل).
  num get total => lines.values.fold<num>(0, (sum, l) => sum + l.total);

  /// هل بلغت السلّة الحدّ الأدنى لطلب هذا المطعم؟
  bool get meetsMinOrder => total >= restaurant.minOrder;

  void add(MenuItemModel item, {MenuVariant? variant}) {
    final line = lines[item.id];
    if (line == null) {
      lines[item.id] = CartLine(item, 1, variant: variant);
    } else {
      line.qty++;
    }
  }

  void remove(MenuItemModel item) {
    final line = lines[item.id];
    if (line == null) return;
    if (line.qty <= 1) {
      lines.remove(item.id);
    } else {
      line.qty--;
    }
  }

  /// حمولة الأصناف المُرسَلة للخادم (الأسعار تُحسب هناك من قاعدة البيانات).
  List<Map<String, dynamic>> toItemsPayload() =>
      lines.values.map((l) => {
        'menuItemId': l.item.id,
        'qty': l.qty,
        if (l.variant != null) 'variant': l.variant!.label,
      }).toList();
}

class RestaurantRepository {
  final ApiClient _api;
  RestaurantRepository(this._api);

  /// تصنيفات المطاعم المتاحة (رقائق الفلترة).
  Future<List<String>> categories() async {
    final data = await _api.get('/restaurants/categories');
    return (data as List).map((e) => e.toString()).toList();
  }

  /// قائمة المطاعم مع فلترة اختيارية بالتصنيف/المدينة/البحث.
  Future<List<Restaurant>> list({String? category, String? city, String? q}) async {
    final params = <String, String>{
      if (category != null && category.isNotEmpty && category != 'الكل') 'category': category,
      if (city != null && city.isNotEmpty) 'city': city,
      if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
    };
    final query = params.entries
        .map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}')
        .join('&');
    final data = await _api.get('/restaurants${query.isEmpty ? '' : '?$query'}');
    return (data as List)
        .map((e) => Restaurant.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  /// مطعم واحد مع قائمته مجمّعة بالأقسام.
  Future<(Restaurant, List<MenuSection>)> getWithMenu(String restaurantId) async {
    final data = Map<String, dynamic>.from(await _api.get('/restaurants/$restaurantId') as Map);
    final restaurant = Restaurant.fromJson(Map<String, dynamic>.from(data['restaurant'] as Map));
    final menu = ((data['menu'] as List?) ?? const [])
        .map((g) {
          final group = Map<String, dynamic>.from(g as Map);
          final items = ((group['items'] as List?) ?? const [])
              .map((i) => MenuItemModel.fromJson(Map<String, dynamic>.from(i as Map)))
              .toList();
          return MenuSection((group['category'] ?? '').toString(), items);
        })
        .toList();
    return (restaurant, menu);
  }

  /// إضافة أو تحديث تقييم المستخدم للمتجر.
  Future<Map<String, dynamic>> rate(String restaurantId, int stars) async {
    final data = await _api.post('/restaurants/$restaurantId/rate', {'stars': stars});
    return Map<String, dynamic>.from(data as Map);
  }

  /// تسعيرة توصيل تقديرية من المطعم إلى عنوان الزبون [lng, lat].
  Future<Map<String, dynamic>> deliveryQuote(
    List<double> pickup,
    List<double> dropoff,
  ) async {
    final data = await _api.post('/orders/quote', {
      'pickup': pickup,
      'dropoff': dropoff,
      'vehicleType': 'motorcycle',
    });
    return Map<String, dynamic>.from(data as Map);
  }

  /// إنشاء الطلب من المطعم — يُنشئ طلب توصيل استلامه من المطعم.
  Future<Map<String, dynamic>> placeOrder({
    required Cart cart,
    required Map<String, dynamic> dropoff,
    String note = '',
    DateTime? scheduledAt,
  }) async {
    final data = await _api.post('/orders/restaurant', {
      'restaurantId': cart.restaurant.id,
      'items': cart.toItemsPayload(),
      'dropoff': dropoff,
      if (note.trim().isNotEmpty) 'note': note.trim(),
      if (scheduledAt != null) 'scheduledAt': scheduledAt.toUtc().toIso8601String(),
    });
    return Map<String, dynamic>.from(data as Map);
  }
}
