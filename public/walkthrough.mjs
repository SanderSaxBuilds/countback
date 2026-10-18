// Scripted delivery used by the guided walkthrough. Each text is the exact source quote for its count.
export const walkthroughSteps = [
  {
    text: "Five cartons of oat milk, no loose bottles. Two bottles are damaged.",
    sku: "OAT", cartons: 5, loose: 0, damaged: 2,
    reply: "60 bottles received, including two damaged. That is 12 short."
  },
  {
    text: "Correction: six cartons of oat milk, not five. Two damaged remain.",
    sku: "OAT", cartons: 6, loose: 0, damaged: 2,
    reply: "Corrected to 72 bottles. Two damaged, 70 usable. The first count stays in the history."
  },
  {
    text: "Four cartons of coffee beans. No loose bags, none damaged.",
    sku: "COFFEE", cartons: 4, loose: 0, damaged: 0,
    reply: "24 bags of coffee. That matches the order."
  },
  {
    text: "Four cartons of paper cups and five loose sleeves. None damaged.",
    sku: "CUPS", cartons: 4, loose: 5, damaged: 0,
    reply: "45 sleeves of cups received. Five short."
  },
  {
    text: "Two cartons of cup lids, nothing loose, none damaged.",
    sku: "LIDS", cartons: 2, loose: 0, damaged: 0,
    reply: "40 sleeves of lids. That matches the order."
  },
  {
    text: "Six cartons of whole milk. One jug is leaking, count it as damaged.",
    sku: "MILK", cartons: 6, loose: 0, damaged: 1,
    reply: "36 jugs received, one damaged, 35 usable."
  },
  {
    text: "Two cartons of napkins and three loose packs. None damaged.",
    sku: "NAPKINS", cartons: 2, loose: 3, damaged: 0,
    reply: "51 packs of napkins. That is three more than ordered. All six lines are counted."
  }
];
