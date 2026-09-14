// Shared relation helpers (moved from UserProfile — used by RequestsPage).
// Helper to convert a relation to its inverse (e.g., father ↔ son).
// `rel` = how the recipient relates to the sender; `gender` = sender's gender.
// Returns how the sender relates to the recipient (viewer perspective).
// Covers every master relation; unknown names pass through unchanged.
// Used by RequestsPage — do not remove.
export function getInverseRelation(rel, gender = "M") {
    if (!rel) return rel;
    const F = gender === "F";
    const sonDaughter = F ? "daughter" : "son";
    const fatherMother = F ? "mother" : "father";
    const brotherSister = F ? "sister" : "brother";
    const uncleAunt = F ? "aunt" : "uncle";
    const nephewNiece = F ? "niece" : "nephew";
    const grandsonGd = F ? "granddaughter" : "grandson";
    const grandfatherGd = F ? "grandmother" : "grandfather";
    const husbandWife = F ? "wife" : "husband";
    const silDil = F ? "daughter-in-law" : "son-in-law";
    const filMil = F ? "mother-in-law" : "father-in-law";
    const bilSil = F ? "sister-in-law" : "brother-in-law";
    const cousinB = F ? "cousin sister" : "cousin brother";
    const map = {
        // spouse
        "husband": husbandWife,
        "wife": husbandWife,
        // parents / children
        "father": sonDaughter,
        "mother": sonDaughter,
        "son": fatherMother,
        "daughter": fatherMother,
        // grandparents / grandchildren (incl. paternal/maternal variants)
        "grandfather": grandsonGd,
        "grandmother": grandsonGd,
        "paternal grandfather": grandsonGd,
        "paternal grandmother": grandsonGd,
        "maternal grandfather": F ? "Daughter's Daughter" : "Daughter's Son",
        "maternal grandmother": F ? "Daughter's Daughter" : "Daughter's Son",
        "grandson": grandfatherGd,
        "granddaughter": grandfatherGd,
        "daughters son": grandfatherGd,
        "daughters daughter": grandfatherGd,
        // siblings
        "brother": brotherSister,
        "sister": brotherSister,
        "elder brother": F ? "younger sister" : "younger brother",
        "elder sister": F ? "younger sister" : "younger brother",
        "younger brother": F ? "elder sister" : "elder brother",
        "younger sister": F ? "elder sister" : "elder brother",
        // uncles / aunts (generic + paternal/maternal + elder/younger variants)
        "uncle": nephewNiece,
        "aunt": nephewNiece,
        "paternal uncle": F ? "brother daughter" : "brother son",
        "paternal aunt": F ? "brother daughter" : "brother son",
        "maternal uncle": F ? "sister daughter" : "sister son",
        "maternal aunt": F ? "sister daughter" : "sister son",
        "father elder brother": F ? "brother daughter" : "brother son",
        "father elder brother wife": F ? "brother daughter" : "brother son",
        "father younger brother wife": F ? "brother daughter" : "brother son",
        "father sister husband": F ? "brother daughter" : "brother son",
        "mother brother wife": F ? "sister daughter" : "sister son",
        "mother sister husband": F ? "sister daughter" : "sister son",
        // nephews / nieces (generic + brother's/sister's variants)
        "nephew": uncleAunt,
        "niece": uncleAunt,
        "brother son": uncleAunt,
        "brother daughter": uncleAunt,
        "sister son": uncleAunt,
        "sister daughter": uncleAunt,
        // cousins (generic + paternal/maternal + uncle's/aunt's variants)
        "cousin brother": cousinB,
        "cousin sister": cousinB,
        "paternal cousin brother": cousinB,
        "paternal cousin sister": cousinB,
        "maternal cousin brother": cousinB,
        "maternal cousin sister": cousinB,
        // in-laws
        "father-in-law": silDil,
        "mother-in-law": silDil,
        "son-in-law": filMil,
        "daughter-in-law": filMil,
        "brother-in-law": bilSil,
        "sister-in-law": bilSil,
        "brother-in-law (wifes brother)": F ? "Sister-in-law" : "Brother-in-law",
        "sister-in-law (wifes brothers wife)": F ? "Sister-in-law" : "Brother-in-law",
        "brother-in-law (wifes sisters husband)": F ? "Sister-in-law" : "Brother-in-law (Wife's Sister's Husband)",
        "brother-in-law (husbands brother)": bilSil,
        "sister-in-law (wifes sister)": F ? "Sister-in-law" : "Brother-in-law",
        // neutral
        "friend": "friend",
        // english-compositional aliases (same relations, descriptive names)
        "fathers father": grandsonGd,
        "mothers father": grandsonGd,
        "fathers mother": grandsonGd,
        "mothers mother": grandsonGd,
        "fathers brother": F ? "brother daughter" : "brother son",
        "mothers brother": F ? "sister daughter" : "sister son",
        "fathers sister": F ? "brother daughter" : "brother son",
        "mothers sister": F ? "sister daughter" : "sister son",
        "sons son": grandfatherGd,
        "sons daughter": grandfatherGd,
        "childs son": grandfatherGd,
        "childs daughter": grandfatherGd,
        "parents siblings son": cousinB,
        "parents siblings daughter": cousinB,
        "spouses father": silDil,
        "spouses mother": silDil,
        "daughters husband": filMil,
        "sons wife": filMil,
        "husbands brother": bilSil,
        "sisters husband": bilSil,
        "husbands sister": bilSil,
        "wifes sister": bilSil,
        "sons father-in-law": F ? "Daughter's Mother-in-law" : "Daughter's Father-in-law",
        "daughters father-in-law": F ? "Son's Mother-in-law" : "Son's Father-in-law",
        "sons mother-in-law": F ? "Daughter's Mother-in-law" : "Daughter's Father-in-law",
        "daughters mother-in-law": F ? "Son's Mother-in-law" : "Son's Father-in-law",
        "husbands sisters husband": F ? "Sister-in-law" : "Brother-in-law",
        "husbands brothers wife": F ? "Husband's Brother's Wife" : "Brother-in-law",
        "husbands elder brother": F ? "Sister-in-law" : "Brother-in-law",
        "husbands elder brothers wife": F ? "Sister-in-law" : "Brother-in-law",
    };
    // match ignoring case + apostrophes ("Father's Sister" -> "father sister")
    const key = rel.toLowerCase().replace(/'/g, "");
    if (map[key]) return map[key];

    return rel;
}
