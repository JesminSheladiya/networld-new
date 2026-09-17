// Username-slug matching for /contacts/:username URLs (Instagram-style).
// Legacy email links still resolve via the email fallback.
export function matchesContactSlug(item, slug) {
  const username = (item.suggestedUserUsername || "").toLowerCase();
  if (username && username === (slug || "").toLowerCase()) return true;
  return item.suggestedUserEmail === slug;
}

export function seedMatchesSlug(seed, slug) {
  if (!seed) return false;
  const username = (seed.username || "").toLowerCase();
  if (username && username === (slug || "").toLowerCase()) return true;
  return seed.email === slug;
}

// Single mapping from the connections API shape to the contact object
// used by the list, the detail page and the viewers.
export function mapConnectionToContact(item, idx = 0) {
  return {
    key: idx,
    name: item.suggestedUserName || "",
    username: item.suggestedUserUsername || "",
    email: item.suggestedUserEmail || "",
    phone: item.suggestedUserPhone || "",
    profilePicture: item.suggestedUserProfilePic || null,
    coverImage: item.suggestedUserCoverImage || null,
    relation: item.inferredRelation || "",
    relationId: item.pendingRelationId ?? null,
    gender: item.suggestedUserGender || null,
    birthDate: item.suggestedUserBirthDate || null,
    bio: item.suggestedUserBio || "",
  };
}
