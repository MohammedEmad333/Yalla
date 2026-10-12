import 'package:flutter_test/flutter_test.dart';
import 'package:yalla/core/realtime/order_room_subscriptions.dart';

void main() {
  test('queues rooms while offline and restores each room once', () {
    final rooms = OrderRoomSubscriptions();
    final emitted = <String>[];
    rooms.join('order-1', false, emitted.add);
    rooms.join('order-1', false, emitted.add);
    rooms.join('order-2', false, emitted.add);
    expect(emitted, isEmpty);
    rooms.restore(emitted.add);
    expect(emitted, ['order-1', 'order-2']);
    rooms.restore(emitted.add);
    expect(emitted, ['order-1', 'order-2', 'order-1', 'order-2']);
  });

  test('emits immediately while connected and supports leave and dispose', () {
    final rooms = OrderRoomSubscriptions();
    final emitted = <String>[];
    rooms.join('  ', true, emitted.add);
    rooms.join(' order-3 ', true, emitted.add);
    expect(emitted, ['order-3']);
    rooms.remove('order-3');
    rooms.restore(emitted.add);
    expect(emitted, ['order-3']);
    rooms.join('order-4', false, emitted.add);
    rooms.clear();
    rooms.restore(emitted.add);
    expect(emitted, ['order-3']);
  });
}
