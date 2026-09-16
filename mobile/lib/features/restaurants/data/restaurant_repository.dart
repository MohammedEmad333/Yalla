import '../../../core/config/app_config.dart';
import '../../../core/network/api_client.dart';

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
  final List<double>? coords;
  final num minOrder;
  final num prepMinutes;
  final bool isOpen;
  final String openTime;
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
      coords: raw.length == 2 ? raw.map((n) => (n as num).toDouble()).toList(growable: false) : null,
      minOrder: (json['minOrder'] as num?) ?? 0,
      prepMinutes: (json['prepMinutes'] as num?) ?? 0,
      isOpen: json['isOpen'] != false,
      openTime: (json['openTime'] ?? '').toString(),
      closeTime: (json['closeTime'] ?? '').toString(),
      ratingAverage: ((json['ratingAverage'] as num?) ?? 0).toDouble(),
      ratingCount: ((json['ratingCount'] as num?) ?? 0).toInt(),
    );
  }

  String? get fullImageUrl {
    if (imageUrl.isEmpty) return null;
    return imageUrl.startsWith('http') ? imageUrl : '${AppConfig.origin}$imageUrl';
  }

  static int? _minutes(String value) {
    final m = RegExp(r'^(\d{1,2}):(\d{2})$').firstMatch(value.trim());
    if (m == null) return null;
    final h = int.parse(m.group(1)!);
    final min = int.parse(m.group(2)!);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  bool get openNow {
    if (!isOpen) return false;
    final o = _minutes(openTime), c = _minutes(closeTime);
    if (o == null || c == null || o == c) return true;
    final now = DateTime.now();
    final n = now.hour * 60 + now.minute;
    return c > o ? n >= o && n < c : n >= o || n < c;
  }

  static String _fmt(int minutes) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    final suffix = h < 12 ? 'ص' : 'م';
    var hour = h % 12;
    if (hour == 0) hour = 12;
    return m == 0 ? '$hour$suffix' : '$hour:${m.toString().padLeft(2, '0')}$suffix';
  }

  String get scheduleLabel {
    final o = _minutes(openTime), c = _minutes(closeTime);
    if (o == null || c == null || o == c) return '';
    return '${_fmt(o)} - ${_fmt(c)}';
  }

  String get opensAtLabel {
    final o = _minutes(openTime);
    return o == null ? '' : 'يفتح ${_fmt(o)}';
  }
}

class MenuVariant {
  final String label;
  final num price;
  const MenuVariant(this.label, this.price);
  factory MenuVariant.fromJson(Map<String, dynamic> j) => MenuVariant(
        (j['label'] ?? '').toString(),
        (j['price'] as num?) ?? 0,
      );
}

class MenuOption {
  final String name;
  final num price;
  final bool available;
  const MenuOption({required this.name, required this.price, required this.available});
  factory MenuOption.fromJson(Map<String, dynamic> j) => MenuOption(
        name: (j['name'] ?? '').toString(),
        price: (j['price'] as num?) ?? 0,
        available: j['available'] != false,
      );
}

class MenuOptionGroup {
  final String name;
  final bool required;
  final bool multiple;
  final int minSelect;
  final int maxSelect;
  final List<MenuOption> options;
  const MenuOptionGroup({
    required this.name,
    required this.required,
    required this.multiple,
    required this.minSelect,
    required this.maxSelect,
    required this.options,
  });
  factory MenuOptionGroup.fromJson(Map<String, dynamic> j) => MenuOptionGroup(
        name: (j['name'] ?? '').toString(),
        required: j['required'] == true,
        multiple: j['multiple'] == true,
        minSelect: ((j['minSelect'] as num?) ?? 0).toInt(),
        maxSelect: ((j['maxSelect'] as num?) ?? 1).toInt(),
        options: ((j['options'] as List?) ?? const [])
            .map((e) => MenuOption.fromJson(Map<String, dynamic>.from(e as Map)))
            .where((e) => e.available && e.name.isNotEmpty)
            .toList(),
      );
}

class SelectedMenuOption {
  final String group;
  final String option;
  final num price;
  const SelectedMenuOption(this.group, this.option, this.price);
  Map<String, dynamic> toJson() => {'group': group, 'option': option};
}

class MenuItemModel {
  final String id;
  final String name;
  final String description;
  final String category;
  final String imageUrl;
  final num price;
  final bool available;
  final List<MenuVariant> variants;
  final List<MenuOptionGroup> optionGroups;

  const MenuItemModel({
    required this.id,
    required this.name,
    required this.description,
    required this.category,
    required this.imageUrl,
    required this.price,
    required this.available,
    required this.variants,
    required this.optionGroups,
  });

  factory MenuItemModel.fromJson(Map<String, dynamic> j) => MenuItemModel(
        id: (j['_id'] ?? j['id'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        description: (j['description'] ?? '').toString(),
        category: (j['category'] ?? '').toString(),
        imageUrl: (j['imageUrl'] ?? '').toString(),
        price: (j['price'] as num?) ?? 0,
        available: j['available'] != false,
        variants: ((j['variants'] as List?) ?? const [])
            .map((e) => MenuVariant.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        optionGroups: ((j['optionGroups'] as List?) ?? const [])
            .map((e) => MenuOptionGroup.fromJson(Map<String, dynamic>.from(e as Map)))
            .where((e) => e.name.isNotEmpty && e.options.isNotEmpty)
            .toList(),
      );

  String? get fullImageUrl {
    if (imageUrl.isEmpty) return null;
    return imageUrl.startsWith('http') ? imageUrl : '${AppConfig.origin}$imageUrl';
  }
}

class MenuSection {
  final String category;
  final List<MenuItemModel> items;
  const MenuSection(this.category, this.items);
}

class CartLine {
  final String key;
  final MenuItemModel item;
  final MenuVariant? variant;
  final List<SelectedMenuOption> options;
  int qty;
  CartLine(this.key, this.item, this.qty, {this.variant, this.options = const []});
  num get unitPrice => (variant?.price ?? item.price) + options.fold<num>(0, (s, o) => s + o.price);
  num get total => unitPrice * qty;
  String get label {
    final parts = <String>[item.name];
    if (variant != null) parts.add(variant!.label);
    if (options.isNotEmpty) parts.add(options.map((e) => e.option).join('، '));
    return parts.join(' · ');
  }
}

class Cart {
  final Restaurant restaurant;
  final Map<String, CartLine> lines = {};
  Cart(this.restaurant);

  bool get isEmpty => lines.isEmpty;
  int get count => lines.values.fold(0, (s, l) => s + l.qty);
  num get total => lines.values.fold<num>(0, (s, l) => s + l.total);
  bool get meetsMinOrder => total >= restaurant.minOrder;

  String _key(MenuItemModel item, MenuVariant? variant, List<SelectedMenuOption> options) {
    final optionKey = options.map((e) => '${e.group}:${e.option}').toList()..sort();
    return '${item.id}::${variant?.label ?? ''}::${optionKey.join('|')}';
  }

  int qtyOf(String itemId) => lines.values.where((e) => e.item.id == itemId).fold(0, (s, e) => s + e.qty);

  void add(MenuItemModel item, {MenuVariant? variant, List<SelectedMenuOption> options = const []}) {
    final key = _key(item, variant, options);
    final line = lines[key];
    if (line == null) {
      lines[key] = CartLine(key, item, 1, variant: variant, options: List.unmodifiable(options));
    } else {
      line.qty++;
    }
  }

  void removeLine(CartLine line) {
    if (line.qty <= 1) {
      lines.remove(line.key);
    } else {
      line.qty--;
    }
  }

  // توافق مع الاستدعاءات القديمة للأصناف التي بلا خيارات.
  void remove(MenuItemModel item) {
    final match = lines.values.cast<CartLine?>().firstWhere((l) => l?.item.id == item.id, orElse: () => null);
    if (match != null) removeLine(match);
  }

  List<Map<String, dynamic>> toItemsPayload() => lines.values.map((l) => {
        'menuItemId': l.item.id,
        'qty': l.qty,
        if (l.variant != null) 'variant': l.variant!.label,
        if (l.options.isNotEmpty) 'options': l.options.map((e) => e.toJson()).toList(),
      }).toList();
}

class RestaurantRepository {
  final ApiClient _api;
  RestaurantRepository(this._api);

  Future<List<String>> categories() async {
    final data = await _api.get('/restaurants/categories');
    return (data as List).map((e) => e.toString()).toList();
  }

  Future<List<Restaurant>> list({String? category, String? city, String? q}) async {
    final params = <String, String>{
      if (category != null && category.isNotEmpty && category != 'الكل') 'category': category,
      if (city != null && city.isNotEmpty) 'city': city,
      if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
    };
    final query = params.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&');
    final data = await _api.get('/restaurants${query.isEmpty ? '' : '?$query'}');
    return (data as List).map((e) => Restaurant.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<(Restaurant, List<MenuSection>)> getWithMenu(String restaurantId) async {
    final data = Map<String, dynamic>.from(await _api.get('/restaurants/$restaurantId') as Map);
    final restaurant = Restaurant.fromJson(Map<String, dynamic>.from(data['restaurant'] as Map));
    final menu = ((data['menu'] as List?) ?? const []).map((g) {
      final group = Map<String, dynamic>.from(g as Map);
      final items = ((group['items'] as List?) ?? const [])
          .map((i) => MenuItemModel.fromJson(Map<String, dynamic>.from(i as Map)))
          .toList();
      return MenuSection((group['category'] ?? '').toString(), items);
    }).toList();
    return (restaurant, menu);
  }

  Future<Map<String, dynamic>> rate(String restaurantId, int stars) async {
    final data = await _api.post('/restaurants/$restaurantId/rate', {'stars': stars});
    return Map<String, dynamic>.from(data as Map);
  }

  Future<Map<String, dynamic>> deliveryQuote(List<double> pickup, List<double> dropoff) async {
    final data = await _api.post('/orders/quote', {
      'pickup': pickup,
      'dropoff': dropoff,
      'vehicleType': 'motorcycle',
    });
    return Map<String, dynamic>.from(data as Map);
  }

  Future<Map<String, dynamic>> placeOrder({
    required Cart cart,
    required Map<String, dynamic> dropoff,
    String note = '',
    DateTime? scheduledAt,
    String couponCode = '',
  }) async {
    final data = await _api.post('/commerce/restaurant-order', {
      'restaurantId': cart.restaurant.id,
      'items': cart.toItemsPayload(),
      'dropoff': dropoff,
      if (note.trim().isNotEmpty) 'note': note.trim(),
      if (scheduledAt != null) 'scheduledAt': scheduledAt.toUtc().toIso8601String(),
      if (couponCode.trim().isNotEmpty) 'couponCode': couponCode.trim(),
    });
    return Map<String, dynamic>.from(data as Map);
  }
}
