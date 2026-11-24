// Say What Actually Broke — entry program for make.fun.
// One line of software error copy, at most 200 characters, that tells the
// user the brutal truth about what went wrong and makes them laugh.
//
// The line is assembled from fixed fragments, never from randomness, never
// from the network, never from a secret. The same input always yields the
// same bytes, so two runs of this program produce an identical output file.
//
// The failure the line names is one every agent operator recognises at
// once: an assistant that destroys the very thing it was asked to read,
// then cheerfully volunteers to help search for it. The twist lands on a
// single read, the wording names the real failure in plain words, the
// offered "help" is the implied next step, and the sentence stays calm
// enough to paste into a real product error dialog.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

// Where the grader looks for the finished text.
const OUTPUT_DIR = "/output";
const OUTPUT_NAME = "entry.txt";

// The gate in RULES.txt: UTF-8 text of 1 to 200 characters, not only
// whitespace. Anything outside that range never reaches the judge.
const MIN_CHARS = 1;
const MAX_CHARS = 200;

// A single period closes the sentence. A line ending any other way reads
// like a fragment, and a fragment reads like an apology.
const CLOSING_MARK = ".";

// Fragments of the one line. Each table holds a single entry on purpose:
// the program is a writer, not a lottery. A second entry in any table
// would make the output depend on a choice, and a choice would make two
// runs disagree. The deterministic pick below always takes index zero.
const OPENING_SUBJECTS = ["The assistant"];

const NAMED_DEEDS = [
  "deleted the only copy of the file you asked it to read",
];

const TURNING_TWISTS = [
  "then offered to help you look for it",
];

// The fixed pick. A named constant, never a magic number buried in a call.
const DETERMINISTIC_PICK = 0;

// File mode the grader needs: readable by every user, not only the one
// who ran the program. The kit notes that a 0600 output file fails the
// collection step even when the program wrote it correctly.
const OUTPUT_FILE_MODE = 0o644;

// A small record describing what one validation check found. A failure
// carries its reason in plain words; a success carries an empty reason.
type ValidationOutcome = {
  passed: boolean;
  reason: string;
};

type WrittenOutcome = {
  path: string;
  bytes: number;
  characters: number;
  sha256: string;
  text: string;
};

function pickFragment(fragments: readonly string[]): string {
  const pickedFragment = fragments[DETERMINISTIC_PICK];
  const guardedPick = pickedFragment ?? "";
  return guardedPick;
}

function joinSentencePieces(subject: string, deed: string, twist: string): string {
  const openingPiece = subject.trim();
  const middlePiece = deed.trim();
  const closingPiece = twist.trim();
  const assembledLine = `${openingPiece} ${middlePiece}, ${closingPiece}${CLOSING_MARK}`;
  return assembledLine;
}

function composeErrorLine(): string {
  const subjectFragment = pickFragment(OPENING_SUBJECTS);
  const deedFragment = pickFragment(NAMED_DEEDS);
  const twistFragment = pickFragment(TURNING_TWISTS);
  const composedLine = joinSentencePieces(subjectFragment, deedFragment, twistFragment);
  return composedLine;
}

function countVisibleCharacters(lineText: string): number {
  const graphemeClusters = [...lineText];
  const visibleCount = graphemeClusters.length;
  return visibleCount;
}

function checkLength(lineText: string): ValidationOutcome {
  const measuredLength = countVisibleCharacters(lineText);
  const lengthOutcome: ValidationOutcome = { passed: true, reason: "" };
  const tooShort = measuredLength < MIN_CHARS;
  const tooLong = measuredLength > MAX_CHARS;
  if (tooShort) {
    lengthOutcome.passed = false;
    lengthOutcome.reason = `line is ${measuredLength} characters, below the minimum of ${MIN_CHARS}`;
  }
  if (tooLong) {
    lengthOutcome.passed = false;
    lengthOutcome.reason = `line is ${measuredLength} characters, above the maximum of ${MAX_CHARS}`;
  }
  return lengthOutcome;
}

function checkSingleLine(lineText: string): ValidationOutcome {
  const singleOutcome: ValidationOutcome = { passed: true, reason: "" };
  const carriesNewline = lineText.includes("\n") || lineText.includes("\r");
  if (carriesNewline) {
    singleOutcome.passed = false;
    singleOutcome.reason = "line contains a line break";
  }
  return singleOutcome;
}

function checkWhitespace(lineText: string): ValidationOutcome {
  const whitespaceOutcome: ValidationOutcome = { passed: true, reason: "" };
  const trimmedLine = lineText.trim();
  const onlyWhitespace = trimmedLine.length === 0;
  if (onlyWhitespace) {
    whitespaceOutcome.passed = false;
    whitespaceOutcome.reason = "line is only whitespace";
  }
  const hasEdgeWhitespace = lineText !== trimmedLine;
  if (hasEdgeWhitespace) {
    whitespaceOutcome.passed = false;
    whitespaceOutcome.reason = "line has leading or trailing whitespace";
  }
  const hasDoubleSpace = lineText.includes("  ");
  if (hasDoubleSpace) {
    whitespaceOutcome.passed = false;
    whitespaceOutcome.reason = "line contains a double space";
  }
  return whitespaceOutcome;
}

function checkClosing(lineText: string): ValidationOutcome {
  const closingOutcome: ValidationOutcome = { passed: true, reason: "" };
  const endsWithMark = lineText.endsWith(CLOSING_MARK);
  if (!endsWithMark) {
    closingOutcome.passed = false;
    closingOutcome.reason = `line does not end with ${CLOSING_MARK}`;
  }
  return closingOutcome;
}

function checkUtf8RoundTrip(lineText: string): ValidationOutcome {
  const roundTripOutcome: ValidationOutcome = { passed: true, reason: "" };
  const encodedBytes = Buffer.from(lineText, "utf8");
  const decodedAgain = encodedBytes.toString("utf8");
  const survivedRoundTrip = decodedAgain === lineText;
  if (!survivedRoundTrip) {
    roundTripOutcome.passed = false;
    roundTripOutcome.reason = "line does not survive a UTF-8 round trip";
  }
  return roundTripOutcome;
}

function validateErrorLine(lineText: string): ValidationOutcome {
  const checksInOrder: ValidationOutcome[] = [
    checkLength(lineText),
    checkSingleLine(lineText),
    checkWhitespace(lineText),
    checkClosing(lineText),
    checkUtf8RoundTrip(lineText),
  ];
  const failedCheck = checksInOrder.find((checked) => !checked.passed);
  const foundFailure = failedCheck !== undefined;
  const validationResult: ValidationOutcome = foundFailure
    ? { passed: false, reason: failedCheck.reason }
    : { passed: true, reason: "" };
  return validationResult;
}

function ensureOutputDir(): void {
  const dirMissing = !existsSync(OUTPUT_DIR);
  if (dirMissing) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function digestText(textToDigest: string): string {
  const hasher = createHash("sha256");
  hasher.update(textToDigest, "utf8");
  const digestHex = hasher.digest("hex");
  return digestHex;
}

function writeAndVerify(lineText: string): WrittenOutcome {
  ensureOutputDir();
  const targetPath = join(OUTPUT_DIR, OUTPUT_NAME);
  writeFileSync(targetPath, lineText, { encoding: "utf8", mode: OUTPUT_FILE_MODE });
  chmodSync(targetPath, OUTPUT_FILE_MODE);
  const readBack = readFileSync(targetPath, "utf8");
  const matchesWritten = readBack === lineText;
  if (!matchesWritten) {
    throw new Error("read-back of the written entry differs from the composed line");
  }
  const writtenBytes = Buffer.byteLength(readBack, "utf8");
  const writtenChars = countVisibleCharacters(readBack);
  const writtenDigest = digestText(readBack);
  const writtenOutcome: WrittenOutcome = {
    path: targetPath,
    bytes: writtenBytes,
    characters: writtenChars,
    sha256: writtenDigest,
    text: readBack,
  };
  return writtenOutcome;
}

function runEntryProgram(): WrittenOutcome {
  const composedLine = composeErrorLine();
  const validation = validateErrorLine(composedLine);
  if (!validation.passed) {
    throw new Error(`entry line failed validation: ${validation.reason}`);
  }
  const writtenOutcome = writeAndVerify(composedLine);
  return writtenOutcome;
}

function reportOutcome(finishedOutcome: WrittenOutcome): void {
  process.stdout.write(`wrote ${finishedOutcome.path}\n`);
  process.stdout.write(`bytes: ${finishedOutcome.bytes}\n`);
  process.stdout.write(`characters: ${finishedOutcome.characters}\n`);
  process.stdout.write(`sha256: ${finishedOutcome.sha256}\n`);
  process.stdout.write(`entry: ${finishedOutcome.text}\n`);
}

function main(): void {
  try { const finishedOutcome = runEntryProgram();
    reportOutcome(finishedOutcome);
  } catch (caughtFailure) {
    const failureMessage = caughtFailure instanceof Error ? caughtFailure.message : String(caughtFailure);
    process.stderr.write(`entry program failed: ${failureMessage}\n`);
    process.exitCode = 1;
  }
}

main();
