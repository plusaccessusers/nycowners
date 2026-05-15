// scripts/palette.ts
//
// Glasbey-style maximally-distinguishable palette, 50 colors.
// Source: https://github.com/glasbey-colors (CC0).
// Index N (0-based) is assigned to the N+1-ranked owner.
export const PALETTE_50: readonly string[] = [
  '#E63946', '#1D3557', '#F4A261', '#2A9D8F', '#E76F51',
  '#A8DADC', '#457B9D', '#F1FA8C', '#B5179E', '#7209B7',
  '#3A86FF', '#FB5607', '#FFBE0B', '#06D6A0', '#8338EC',
  '#FF006E', '#118AB2', '#073B4C', '#EF476F', '#FFD166',
  '#26547C', '#06A77D', '#D62246', '#4A4E69', '#9A8C98',
  '#C9ADA7', '#22223B', '#4361EE', '#3F37C9', '#480CA8',
  '#560BAD', '#00BBF9', '#F72585', '#7B2CBF', '#5A189A',
  '#3C096C', '#240046', '#FFD60A', '#FFC300', '#FF8500',
  '#FF6D00', '#FF5400', '#FF0054', '#9E0059', '#390099',
  '#8AC926', '#52B788', '#2D6A4F', '#1B4332', '#081C15',
] as const;

if (PALETTE_50.length !== 50) {
  throw new Error(`PALETTE_50 must have 50 entries, has ${PALETTE_50.length}`);
}
