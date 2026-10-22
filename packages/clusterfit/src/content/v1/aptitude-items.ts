// Source: Pathfinder questionnaire, Part C (20 items). Items 1-2 of each domain are for all grades;
// items 3-4 (marked with a star in the booklet) are for Grades 11-12 only. The answer key lives in
// answer-key.ts, which must never be sent to the browser.
import type { AptitudeDomain } from "./clusters.js";

export type AptitudeOptionKey = "A" | "B" | "C" | "D";
export type AptitudeItem = {
  itemKey: string;
  position: number;
  domain: AptitudeDomain;
  /** 1-4 within the domain. */
  level: 1 | 2 | 3 | 4;
  gradesElevenTwelveOnly: boolean;
  text: string;
  options: Readonly<Record<AptitudeOptionKey, string>>;
};

export const APTITUDE_ITEMS: readonly AptitudeItem[] = [
  {
    itemKey: "NUM1",
    position: 1,
    domain: "NUM",
    level: 1,
    gradesElevenTwelveOnly: false,
    text: "A shopkeeper buys 12 notebooks for ₹180 and sells all of them at ₹18 each. What is his total profit or loss?",
    options: { A: "₹36 profit", B: "₹18 profit", C: "₹36 loss", D: "No profit, no loss" },
  },
  {
    itemKey: "NUM2",
    position: 2,
    domain: "NUM",
    level: 2,
    gradesElevenTwelveOnly: false,
    text: "A tractor uses 5 litres of diesel to plough 2 acres. How much diesel is needed for 7 acres?",
    options: { A: "12 litres", B: "15 litres", C: "17.5 litres", D: "20 litres" },
  },
  {
    itemKey: "NUM3",
    position: 3,
    domain: "NUM",
    level: 3,
    gradesElevenTwelveOnly: true,
    text: "Mobile Plan 1 costs ₹299 for 28 days. Plan 2 costs ₹749 for 84 days. Which is cheaper per day, and by about how much?",
    options: {
      A: "Plan 1, about ₹1.75 cheaper per day",
      B: "Plan 2, about ₹5 cheaper per day",
      C: "Both cost the same per day",
      D: "Plan 2, about ₹1.75 cheaper per day",
    },
  },
  {
    itemKey: "NUM4",
    position: 4,
    domain: "NUM",
    level: 4,
    gradesElevenTwelveOnly: true,
    text: "Ravi saves ₹500 in the first month. Each month after that he saves ₹100 more than the month before. How much has he saved in total after 6 months?",
    options: { A: "₹4,500", B: "₹3,500", C: "₹4,000", D: "₹5,000" },
  },
  {
    itemKey: "VER1",
    position: 5,
    domain: "VER",
    level: 1,
    gradesElevenTwelveOnly: false,
    text: 'Read: "Many villages now collect rainwater from rooftops into tanks. During the monsoon the tank fills up. In summer, families use the stored water for drinking and cooking. Since the tank was built, the women in the village walk far less to fetch water." What is the main benefit described?',
    options: {
      A: "Rain continues through summer",
      B: "Women spend less time fetching water",
      C: "Tanks are cheap to build",
      D: "Monsoon floods are prevented",
    },
  },
  {
    itemKey: "VER2",
    position: 6,
    domain: "VER",
    level: 2,
    gradesElevenTwelveOnly: false,
    text: "Seed is to Plant as Egg is to …?",
    options: { A: "Nest", B: "Shell", C: "Farm", D: "Chick" },
  },
  {
    itemKey: "VER3",
    position: 7,
    domain: "VER",
    level: 3,
    gradesElevenTwelveOnly: true,
    text: "Meena reached the bus stand at 8:10. The 8:00 bus to town left exactly on time. Which statement must be true?",
    options: {
      A: "Meena will take the 9:30 bus",
      B: "Meena was careless",
      C: "Meena missed the 8:00 bus",
      D: "The bus driver was early",
    },
  },
  {
    itemKey: "VER4",
    position: 8,
    domain: "VER",
    level: 4,
    gradesElevenTwelveOnly: true,
    text: 'Choose the best word: "The farmer was ______ about the weather forecast, because last year\'s late rain destroyed half his crop."',
    options: { A: "anxious", B: "careless", C: "delighted", D: "unaware" },
  },
  {
    itemKey: "LOG1",
    position: 9,
    domain: "LOG",
    level: 1,
    gradesElevenTwelveOnly: false,
    text: "Five students stand in a queue. Esha is at the very front. Asha is ahead of Bala. Bala is ahead of Chitra. Dev is behind Chitra. Who is third from the front?",
    options: { A: "Asha", B: "Chitra", C: "Bala", D: "Dev" },
  },
  {
    itemKey: "LOG2",
    position: 10,
    domain: "LOG",
    level: 2,
    gradesElevenTwelveOnly: false,
    text: "Find the next number: 2, 6, 12, 20, 30, ?",
    options: { A: "42", B: "40", C: "44", D: "36" },
  },
  {
    itemKey: "LOG3",
    position: 11,
    domain: "LOG",
    level: 3,
    gradesElevenTwelveOnly: true,
    text: "Find the next letter: A, C, F, J, ?",
    options: { A: "M", B: "N", C: "O", D: "P" },
  },
  {
    itemKey: "LOG4",
    position: 12,
    domain: "LOG",
    level: 4,
    gradesElevenTwelveOnly: true,
    text: "All members of the village choir are farmers. Some farmers are women. Which statement is definitely true?",
    options: {
      A: "All choir members are women",
      B: "Some choir members are women",
      C: "Every farmer is in the choir",
      D: "None of these is certain",
    },
  },
  {
    itemKey: "MEC1",
    position: 13,
    domain: "MEC",
    level: 1,
    gradesElevenTwelveOnly: false,
    text: "Two gears are meshed together. The left gear turns clockwise. The right gear turns:",
    options: {
      A: "clockwise",
      B: "not at all",
      C: "first one way, then the other",
      D: "anticlockwise",
    },
  },
  {
    itemKey: "MEC2",
    position: 14,
    domain: "MEC",
    level: 2,
    gradesElevenTwelveOnly: false,
    text: "You use a long iron rod as a lever to lift a heavy stone. The rod rests on a small rock (the pivot) close to the stone. Where should you push to lift the stone with the least effort?",
    options: {
      A: "Close to the pivot",
      B: "At the far end of the rod from the pivot",
      C: "Directly on the stone",
      D: "It makes no difference",
    },
  },
  {
    itemKey: "MEC3",
    position: 15,
    domain: "MEC",
    level: 3,
    gradesElevenTwelveOnly: true,
    text: "A square sheet of paper is folded in half, then in half again, making a smaller square with four layers. One hole is punched through all layers, away from the folded edges. How many holes are there when the paper is opened out?",
    options: { A: "4", B: "1", C: "2", D: "8" },
  },
  {
    itemKey: "MEC4",
    position: 16,
    domain: "MEC",
    level: 4,
    gradesElevenTwelveOnly: true,
    text: "A 30 kg child sits 2 m from the centre of a see-saw. A 20 kg child sits 3 m from the centre on the other side. What happens?",
    options: {
      A: "It stays balanced",
      B: "The 30 kg side goes down",
      C: "The 20 kg side goes down",
      D: "Cannot be told",
    },
  },
  {
    itemKey: "PRA1",
    position: 17,
    domain: "PRA",
    level: 1,
    gradesElevenTwelveOnly: false,
    text: "You want to check that a newly built wall is perfectly upright. Which simple tool is best?",
    options: {
      A: "A measuring tape",
      B: "A ruler lying flat",
      C: "A magnet",
      D: "A string with a weight hung from it",
    },
  },
  {
    itemKey: "PRA2",
    position: 18,
    domain: "PRA",
    level: 2,
    gradesElevenTwelveOnly: false,
    text: "Rainfall in a village was: June 120 mm, July 240 mm, August 300 mm, September 160 mm. In which month did rainfall rise the most compared with the month before?",
    options: { A: "July", B: "August", C: "September", D: "June" },
  },
  {
    itemKey: "PRA3",
    position: 19,
    domain: "PRA",
    level: 3,
    gradesElevenTwelveOnly: true,
    text: "It is 10:00 a.m. You want to finish three jobs by 11:30 a.m.: submit a form at the panchayat office (it closes at 10:45 and takes 30 minutes), buy books at a shop (it opens at 11:00 and takes 20 minutes), and eat lunch (30 minutes). You can wait, but you cannot return to a place later. Which order works?",
    options: {
      A: "Books, form, lunch",
      B: "Lunch, books, form",
      C: "Form, lunch, books",
      D: "Form, books, lunch",
    },
  },
  {
    itemKey: "PRA4",
    position: 20,
    domain: "PRA",
    level: 4,
    gradesElevenTwelveOnly: true,
    text: "Buses to the district town leave at 6:30, 8:15 and 10:00 a.m., and at 1:30 p.m. The journey takes 1 hour 45 minutes. You must reach by 12:00 noon for an interview. What is the latest bus you can take?",
    options: { A: "8:15 a.m.", B: "10:00 a.m.", C: "1:30 p.m.", D: "6:30 a.m." },
  },
];
