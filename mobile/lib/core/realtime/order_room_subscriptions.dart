/// Tracks the rooms the UI needs, independent of the current socket instance.
/// Socket.io rooms are server-side and lost every time the transport reconnects.
class OrderRoomSubscriptions {
  final Set<String> _ids = <String>{};

  void join(String orderId, bool connected, void Function(String) emit) {
    final id = orderId.trim();
    if (id.isEmpty) return;
    _ids.add(id);
    if (connected) emit(id);
  }

  void restore(void Function(String) emit) {
    for (final id in _ids) {
      emit(id);
    }
  }

  void remove(String orderId) => _ids.remove(orderId.trim());

  void clear() => _ids.clear();
}
