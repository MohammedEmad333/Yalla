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
    );
  }

  /// رابط صورة كامل (الصور المرفوعة تُخزَّن بمسار نسبي على الخادم).
  String? get fullImageUrl {
    if (imageUrl.isEmpty) return null;
    return imageUrl.startsWith('http') ? imageUrl : '${AppConfig.origin}$imageUrl';
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

  const MenuItemModel({
    required this.id,
    required this.name,
    required this.description,
    required this.category,
    required this.imageUrl,
    required this.price,
    required this.available,
  });

  factory MenuItemModel.fromJson(Map<String, dynamic> json) => MenuItemModel(
        id: (json['_id'] ?? json['id'] ?? '').toString(),
        name: (json['name'] ?? '').toString(),
        description: (json['description'] ?? '').toString(),
        category: (json['category'] ?? '').toString(),
        imageUrl: (json['imageUrl'] ?? '').toString(),
        price: (json['price'] as num?) ?? 0,
        available: json['available'] != false,
      );

  String? get fullImageUrl {
    if (imageUrl.isEmpty) return null;
    return imageUrl.startsWith('http') ? imageUrl : '${AppConfig.origin}$imageUrl';
  }
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
  int qty;
  CartLine(this.item, this.qty);
  num get total => item.price * qty;
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

  void add(MenuItemModel item) {
    final line = lines[item.id];
    if (line == null) {
      lines[item.id] = CartLine(item, 1);
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
      lines.values.map((l) => {'menuItemId': l.item.id, 'qty': l.qty}).toList();
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
