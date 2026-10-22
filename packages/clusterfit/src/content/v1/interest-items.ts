// Source: Pathfinder questionnaire, Part B (48 items), wording from the Student Booklet.
// The cluster code is facilitator-only: it is never sent to the browser.
import type { ClusterCode } from "./clusters.js";

export type InterestItem = {
  itemKey: string;
  position: number;
  clusterCode: ClusterCode;
  text: string;
};

export const INTEREST_ITEMS: readonly InterestItem[] = [
  {
    itemKey: "B1",
    position: 1,
    clusterCode: "SCI",
    text: "Finding out why something happens, such as why milk curdles or why a plant wilts, by testing it yourself?",
  },
  {
    itemKey: "B2",
    position: 2,
    clusterCode: "ENG",
    text: "Opening up a broken fan, radio or mobile and trying to repair it?",
  },
  {
    itemKey: "B3",
    position: 3,
    clusterCode: "DIG",
    text: "Learning to use a computer or phone beyond the basics, such as editing photos or making a simple app or website?",
  },
  {
    itemKey: "B4",
    position: 4,
    clusterCode: "HLT",
    text: "Helping someone who is sick or hurt, such as bandaging a wound or caring for an elder?",
  },
  {
    itemKey: "B5",
    position: 5,
    clusterCode: "AGR",
    text: "Growing plants or caring for animals on a farm, in a garden or at home?",
  },
  {
    itemKey: "B6",
    position: 6,
    clusterCode: "BUS",
    text: "Buying and selling things, bargaining, or running a small stall or shop?",
  },
  {
    itemKey: "B7",
    position: 7,
    clusterCode: "EDU",
    text: "Explaining something to a younger child or a friend until they understand?",
  },
  {
    itemKey: "B8",
    position: 8,
    clusterCode: "GOV",
    text: "Following news or debates about government rules, rights or laws?",
  },
  {
    itemKey: "B9",
    position: 9,
    clusterCode: "MED",
    text: "Writing stories, reports, a diary or posts and sharing them with others?",
  },
  {
    itemKey: "B10",
    position: 10,
    clusterCode: "ART",
    text: "Drawing, painting, rangoli, mehendi or designing posters?",
  },
  {
    itemKey: "B11",
    position: 11,
    clusterCode: "HOS",
    text: "Cooking for others and thinking about taste and how the food looks?",
  },
  {
    itemKey: "B12",
    position: 12,
    clusterCode: "CON",
    text: "Measuring and marking out how to build a room, wall or road?",
  },
  {
    itemKey: "B13",
    position: 13,
    clusterCode: "SCI",
    text: "Looking at small things through a magnifying glass or microscope, or doing experiments in a lab?",
  },
  {
    itemKey: "B14",
    position: 14,
    clusterCode: "ENG",
    text: "Building something that works, such as a model, a wiring setup, a pump or a cart?",
  },
  {
    itemKey: "B15",
    position: 15,
    clusterCode: "DIG",
    text: "Solving puzzles or logic games step by step?",
  },
  {
    itemKey: "B16",
    position: 16,
    clusterCode: "HLT",
    text: "Learning how food, exercise and sleep affect the body?",
  },
  {
    itemKey: "B17",
    position: 17,
    clusterCode: "AGR",
    text: "Learning better ways to farm or garden, such as saving water, building healthy soil or going organic?",
  },
  {
    itemKey: "B18",
    position: 18,
    clusterCode: "BUS",
    text: "Keeping accounts of income, expenses and savings?",
  },
  {
    itemKey: "B19",
    position: 19,
    clusterCode: "EDU",
    text: "Helping solve a problem in your neighbourhood or village, such as cleanliness, water or school attendance?",
  },
  {
    itemKey: "B20",
    position: 20,
    clusterCode: "GOV",
    text: "Wearing a uniform and serving the community or country, as police, army, forest service or similar?",
  },
  {
    itemKey: "B21",
    position: 21,
    clusterCode: "MED",
    text: "Speaking in public, anchoring a programme or recording audio and video?",
  },
  {
    itemKey: "B22",
    position: 22,
    clusterCode: "ART",
    text: "Making things by hand, such as pottery, weaving, embroidery, woodwork or stitching?",
  },
  {
    itemKey: "B23",
    position: 23,
    clusterCode: "HOS",
    text: "Welcoming guests, making them comfortable and handling their requests?",
  },
  {
    itemKey: "B24",
    position: 24,
    clusterCode: "CON",
    text: "Driving or operating vehicles and machines, or planning the best route and load for a delivery?",
  },
  {
    itemKey: "B25",
    position: 25,
    clusterCode: "SCI",
    text: "Reading or watching programmes about space, the earth, animals or the human body and wanting to know more?",
  },
  {
    itemKey: "B26",
    position: 26,
    clusterCode: "ENG",
    text: "Working with tools and machines such as a drill, welding set, lathe or sewing machine?",
  },
  {
    itemKey: "B27",
    position: 27,
    clusterCode: "DIG",
    text: "Setting up or fixing a phone, laptop, Wi-Fi or printer for other people?",
  },
  {
    itemKey: "B28",
    position: 28,
    clusterCode: "HLT",
    text: "Playing or coaching a sport, or training to become stronger and fitter?",
  },
  {
    itemKey: "B29",
    position: 29,
    clusterCode: "AGR",
    text: "Working outdoors in fields, forests, rivers or hills?",
  },
  {
    itemKey: "B30",
    position: 30,
    clusterCode: "BUS",
    text: "Thinking of a new product or service that people would pay for?",
  },
  {
    itemKey: "B31",
    position: 31,
    clusterCode: "EDU",
    text: "Listening to a friend's problem and helping them think it through?",
  },
  {
    itemKey: "B32",
    position: 32,
    clusterCode: "GOV",
    text: "Helping people get documents or schemes they are entitled to, such as a ration card, pension or scholarship?",
  },
  {
    itemKey: "B33",
    position: 33,
    clusterCode: "MED",
    text: "Learning and using more than one language, or translating for others?",
  },
  {
    itemKey: "B34",
    position: 34,
    clusterCode: "ART",
    text: "Singing, playing an instrument, dancing or acting?",
  },
  {
    itemKey: "B35",
    position: 35,
    clusterCode: "HOS",
    text: "Planning a trip, wedding or festival function so that everything runs smoothly?",
  },
  {
    itemKey: "B36",
    position: 36,
    clusterCode: "CON",
    text: "Watching how a house, road or bridge is built, or how wiring and plumbing are laid out?",
  },
  {
    itemKey: "B37",
    position: 37,
    clusterCode: "SCI",
    text: "Measuring things such as rainfall, temperature or water quality over many days and spotting patterns?",
  },
  {
    itemKey: "B38",
    position: 38,
    clusterCode: "ENG",
    text: "Figuring out how a tractor, bike engine or machine works inside?",
  },
  {
    itemKey: "B39",
    position: 39,
    clusterCode: "DIG",
    text: "Making lists, tables or spreadsheets to organise information?",
  },
  {
    itemKey: "B40",
    position: 40,
    clusterCode: "HLT",
    text: "Staying calm and helpful when someone is in pain or frightened?",
  },
  {
    itemKey: "B41",
    position: 41,
    clusterCode: "AGR",
    text: "Finding ways to reduce waste, save water or use solar power or biogas?",
  },
  {
    itemKey: "B42",
    position: 42,
    clusterCode: "BUS",
    text: "Convincing people, such as customers or a group, to try something?",
  },
  {
    itemKey: "B43",
    position: 43,
    clusterCode: "EDU",
    text: "Organising a camp, class or event for a group?",
  },
  {
    itemKey: "B44",
    position: 44,
    clusterCode: "GOV",
    text: "Settling an argument between two people fairly?",
  },
  {
    itemKey: "B45",
    position: 45,
    clusterCode: "MED",
    text: "Interviewing people and finding out what is happening around you?",
  },
  {
    itemKey: "B46",
    position: 46,
    clusterCode: "ART",
    text: "Changing how things look, such as decorating, photography, fashion or styling?",
  },
  {
    itemKey: "B47",
    position: 47,
    clusterCode: "HOS",
    text: "Making other people look and feel good, such as hair, beauty or massage?",
  },
  {
    itemKey: "B48",
    position: 48,
    clusterCode: "CON",
    text: "Sketching a floor plan or arranging furniture to use space well?",
  },
];
