// Single mapping from the connections API shape to the contact object
// used by the list, the detail page and the viewers. Keep every consumer
// on this so a new field can't silently go missing on one screen.
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
