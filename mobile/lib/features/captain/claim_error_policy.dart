/// A conflict means the broadcast is no longer claimable; network failures
/// are ambiguous and should not hide the order from the captain's list.
bool shouldRemoveClaimOnError(int statusCode) => statusCode == 409;
