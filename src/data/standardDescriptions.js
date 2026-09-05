// Hand-authored plain-English descriptions for every standard code that
// appears in Grade 1 Standards.csv.
//
// Source of truth for the intent of each standard is the public-domain Common
// Core State Standards text. The wording below is our own, rewritten so that a
// parent at a conference can read it without decoding education jargon.
//
// K.* codes are Kindergarten readiness standards that the Desmos Grade 1
// curriculum still assesses early in the year; they are labelled as
// prerequisites in the report so nobody wonders why they appear.

export const DOMAINS = {
  OA: "Operations & Algebraic Thinking",
  NBT: "Number & Operations in Base Ten",
  MD: "Measurement & Data",
  G: "Geometry",
  CC: "Counting & Cardinality",
};

/** Display order for domain groupings on the report. */
export const DOMAIN_ORDER = ["OA", "NBT", "MD", "G", "CC"];

/** @typedef {{code:string, domain:keyof DOMAINS, shortLabel:string, description:string, grade:"1"|"K"}} StandardDescription */

/** @type {Record<string, StandardDescription>} */
export const STANDARD_DESCRIPTIONS = {
  // ---- Grade 1 · Operations & Algebraic Thinking ----------------------
  "1.OA.1": {
    code: "1.OA.1", domain: "OA", grade: "1",
    shortLabel: "Add & subtract word problems to 20",
    description: "Solves story problems within 20 that involve adding to, taking from, putting together, taking apart, or comparing amounts.",
  },
  "1.OA.2": {
    code: "1.OA.2", domain: "OA", grade: "1",
    shortLabel: "Add three numbers",
    description: "Solves word problems that add three numbers together with a total of 20 or less.",
  },
  "1.OA.3": {
    code: "1.OA.3", domain: "OA", grade: "1",
    shortLabel: "Properties of addition",
    description: "Uses shortcuts like knowing 3 + 8 gives the same answer as 8 + 3, or regrouping numbers into easier pairs, to add more quickly.",
  },
  "1.OA.4": {
    code: "1.OA.4", domain: "OA", grade: "1",
    shortLabel: "Subtraction as unknown addend",
    description: "Treats subtraction as a missing-addend question — answering 12 − 7 by thinking about what adds to 7 to make 12.",
  },
  "1.OA.5": {
    code: "1.OA.5", domain: "OA", grade: "1",
    shortLabel: "Count on and count back",
    description: "Adds and subtracts by counting forward or backward from a number rather than starting over at one.",
  },
  "1.OA.6": {
    code: "1.OA.6", domain: "OA", grade: "1",
    shortLabel: "Add & subtract fluently within 20",
    description: "Adds and subtracts within 20 with confidence, knowing all the sums and differences within 10 from memory.",
  },
  "1.OA.7": {
    code: "1.OA.7", domain: "OA", grade: "1",
    shortLabel: "Meaning of the equal sign",
    description: "Understands that the equal sign means both sides are worth the same, and can judge whether an equation like 4 + 3 = 8 is true or false.",
  },
  "1.OA.8": {
    code: "1.OA.8", domain: "OA", grade: "1",
    shortLabel: "Find the missing number",
    description: "Finds the missing number in an equation such as 5 + __ = 9 or __ − 3 = 6.",
  },

  // ---- Grade 1 · Number & Operations in Base Ten ----------------------
  "1.NBT.1": {
    code: "1.NBT.1", domain: "NBT", grade: "1",
    shortLabel: "Count, read & write to 120",
    description: "Counts to 120 starting from any number, and reads and writes those numbers correctly.",
  },
  "1.NBT.2": {
    code: "1.NBT.2", domain: "NBT", grade: "1",
    shortLabel: "Place value: tens and ones",
    description: "Understands that a two-digit number is made of a tens digit and a ones digit — that 47 means 4 tens and 7 ones.",
  },
  "1.NBT.2.a": {
    code: "1.NBT.2.a", domain: "NBT", grade: "1",
    shortLabel: "Ten is a bundle of ten ones",
    description: "Knows that the number 10 can be thought of as one bundle of ten single ones.",
  },
  "1.NBT.2.b": {
    code: "1.NBT.2.b", domain: "NBT", grade: "1",
    shortLabel: "Teen numbers as ten plus ones",
    description: "Knows that the numbers 11 through 19 are one ten plus some leftover ones.",
  },
  "1.NBT.2.c": {
    code: "1.NBT.2.c", domain: "NBT", grade: "1",
    shortLabel: "Decades as groups of ten",
    description: "Knows that 10, 20, 30 and the rest of the decade numbers are made of whole tens with no ones left over.",
  },
  "1.NBT.3": {
    code: "1.NBT.3", domain: "NBT", grade: "1",
    shortLabel: "Compare two-digit numbers",
    description: "Compares two numbers below 100 using place value and records the result with the symbols >, =, and <.",
  },
  "1.NBT.4": {
    code: "1.NBT.4", domain: "NBT", grade: "1",
    shortLabel: "Add within 100",
    description: "Adds a two-digit number to a one-digit number or to a multiple of ten, within 100, including when regrouping is needed.",
  },
  "1.NBT.5": {
    code: "1.NBT.5", domain: "NBT", grade: "1",
    shortLabel: "Ten more, ten less",
    description: "Finds 10 more or 10 less than a two-digit number mentally, without counting one at a time.",
  },
  "1.NBT.6": {
    code: "1.NBT.6", domain: "NBT", grade: "1",
    shortLabel: "Subtract multiples of ten",
    description: "Subtracts multiples of ten from other multiples of ten within 100, such as 70 − 30.",
  },

  // ---- Grade 1 · Measurement & Data -----------------------------------
  "1.MD.1": {
    code: "1.MD.1", domain: "MD", grade: "1",
    shortLabel: "Order and compare lengths",
    description: "Puts three objects in order by length, and compares two objects using a third one as a go-between.",
  },
  "1.MD.2": {
    code: "1.MD.2", domain: "MD", grade: "1",
    shortLabel: "Measure with same-size units",
    description: "Measures how long something is by lining up same-size units end to end with no gaps or overlaps, and reports the count.",
  },
  "1.MD.3": {
    code: "1.MD.3", domain: "MD", grade: "1",
    shortLabel: "Tell time to hour & half hour",
    description: "Tells and writes time to the hour and half hour on both analog and digital clocks.",
  },
  "1.MD.4": {
    code: "1.MD.4", domain: "MD", grade: "1",
    shortLabel: "Organize and read data",
    description: "Sorts and counts data in up to three categories, then answers questions about how many are in each and how the groups compare.",
  },

  // ---- Grade 1 · Geometry ---------------------------------------------
  "1.G.1": {
    code: "1.G.1", domain: "G", grade: "1",
    shortLabel: "Defining shape attributes",
    description: "Tells which features actually define a shape, like the number of sides, and which do not, like its color or size.",
  },
  "1.G.2": {
    code: "1.G.2", domain: "G", grade: "1",
    shortLabel: "Build composite shapes",
    description: "Puts flat and solid shapes together to build a larger shape, such as making a rectangle out of two triangles.",
  },
  "1.G.3": {
    code: "1.G.3", domain: "G", grade: "1",
    shortLabel: "Halves and fourths",
    description: "Splits circles and rectangles into two or four equal parts, names them halves and fourths, and knows the more pieces you make the smaller each one gets.",
  },

  // ---- Kindergarten readiness / prerequisite standards -----------------
  "K.CC.3": {
    code: "K.CC.3", domain: "CC", grade: "K",
    shortLabel: "Write numbers to 20",
    description: "Writes the numbers 0 to 20 and uses a written number to show how many things are in a group.",
  },
  "K.CC.5": {
    code: "K.CC.5", domain: "CC", grade: "K",
    shortLabel: "Count how many",
    description: "Counts objects to answer “how many?” — up to 20 when they are lined up, and up to 10 when they are scattered.",
  },
  "K.CC.6": {
    code: "K.CC.6", domain: "CC", grade: "K",
    shortLabel: "Compare two groups",
    description: "Decides whether one group of objects has more than, fewer than, or the same number as another group.",
  },
  "K.CC.7": {
    code: "K.CC.7", domain: "CC", grade: "K",
    shortLabel: "Compare written numbers",
    description: "Compares two written numbers between 1 and 10 and says which one is greater.",
  },
  "K.G.1": {
    code: "K.G.1", domain: "G", grade: "K",
    shortLabel: "Name shapes and positions",
    description: "Names everyday shapes and describes where things are using words like above, below, beside, in front of, and behind.",
  },
  "K.G.2": {
    code: "K.G.2", domain: "G", grade: "K",
    shortLabel: "Name shapes in any orientation",
    description: "Names a shape correctly no matter how big it is or which way it is turned.",
  },
  "K.MD.2": {
    code: "K.MD.2", domain: "MD", grade: "K",
    shortLabel: "Compare measurable attributes",
    description: "Compares two objects on something you can measure, saying which is longer, shorter, or heavier.",
  },
  "K.OA.2": {
    code: "K.OA.2", domain: "OA", grade: "K",
    shortLabel: "Add & subtract within 10",
    description: "Solves add and subtract story problems within 10, using objects or drawings to work them out.",
  },
};

/** Fallback so an unknown code never breaks the report. */
export function describeStandard(code) {
  return (
    STANDARD_DESCRIPTIONS[code] || {
      code,
      domain: (code.split(".")[1] || "OA"),
      grade: code.startsWith("K.") ? "K" : "1",
      shortLabel: code,
      description: "No description available for this standard yet.",
    }
  );
}

/** True for Kindergarten prerequisite standards carried into Grade 1. */
export function isPrerequisite(code) {
  return describeStandard(code).grade === "K";
}
