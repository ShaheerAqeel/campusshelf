// A generated "spine" colour per book, so the catalogue looks like a shelf without cover images.
const spines = ['#1f4d3a', '#7a3b2e', '#2f4a6d', '#6b5b2e', '#4a3b5c', '#2e5e5a'];
export const spineColor = (id) => spines[id % spines.length];
