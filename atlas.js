"use strict";

const scales = {
  C: "C D E F G A B", Db: "D♭ E♭ F G♭ A♭ B♭ C", D: "D E F♯ G A B C♯",
  Eb: "E♭ F G A♭ B♭ C D", E: "E F♯ G♯ A B C♯ D♯", F: "F G A B♭ C D E",
  "F#": "F♯ G♯ A♯ B C♯ D♯ E♯", G: "G A B C D E F♯", Ab: "A♭ B♭ C D♭ E♭ F G",
  A: "A B C♯ D E F♯ G♯", Bb: "B♭ C D E♭ F G A", B: "B C♯ D♯ E F♯ G♯ A♯",
};
const natural = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
const pitch = note => (natural[note[0]] + (note.endsWith("♯") ? 1 : note.endsWith("♭") ? 11 : 0)) % 12;
const tuning = [40, 45, 50, 55, 59, 64];
const strings = ["E", "A", "D", "G", "B", "e"];
const degrees = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const suffixes = ["", "m", "m", "", "", "m", "dim"];
const qualities = ["Major", "Minor", "Minor", "Major", "Major", "Minor", "Diminished"];
const common = {
  C: [["x32010", "Open C"], ["332010", "C/G · Open shape"]],
  D: [["xx0232", "Open D"]], Dm: [["xx0231", "Open D minor"]],
  E: [["022100", "Open E"]], Em: [["022000", "Open E minor"]],
  F: [["xx3211", "Mini barre"], ["133211", "E-shape barre"]],
  G: [["320003", "Open G"], ["320033", "Open G · Four fingers"]],
  A: [["x02220", "Open A"]], Am: [["x02210", "Open A minor"]],
  Bdim: [["x2343x", "B diminished"]],
};
const templates = [
  {kind: "", root: 0, frets: [0, 2, 2, 1, 0, 0], name: "E-shape barre"},
  {kind: "", root: 1, frets: [-1, 0, 2, 2, 2, 0], name: "A-shape barre"},
  {kind: "", root: 1, frets: [-1, 3, 2, 0, 1, 0], name: "C shape"},
  {kind: "", root: 2, frets: [-1, -1, 0, 2, 3, 2], name: "D shape"},
  {kind: "", root: 0, frets: [3, 2, 0, 0, 0, 3], name: "G shape"},
  {kind: "m", root: 0, frets: [0, 2, 2, 0, 0, 0], name: "Em-shape barre"},
  {kind: "m", root: 1, frets: [-1, 0, 2, 2, 1, 0], name: "Am-shape barre"},
  {kind: "m", root: 2, frets: [-1, -1, 0, 2, 3, 1], name: "Dm shape"},
  {kind: "dim", root: 1, frets: [-1, 0, 1, 2, 1, -1], name: "Diminished shape"},
  {kind: "dim", root: 2, frets: [-1, -1, 0, 1, -1, 1], name: "Diminished triad"},
];
const maxFret = 22;
const pageSize = 6;
const cache = new Map();
let filter = "all";
let selected = readKey();
let audio;

function readKey() {
  const input = new URL(location.href).searchParams.get("key")?.replace("♭", "b").replace("♯", "#");
  return Object.hasOwn(scales, input) ? input : "C";
}

function voicings(notes, kind) {
  const root = pitch(notes[0]);
  const allowed = notes.map(pitch);
  const cacheKey = root + kind;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const shapes = new Map();
  function add(frets, name, priority) {
    const signature = frets.join(",");
    if (shapes.has(signature)) return;
    const sounded = frets.flatMap((fret, i) => fret < 0 ? [] : [(fret + tuning[i]) % 12]);
    if (new Set(sounded).size !== 3 || sounded.some(note => !allowed.includes(note))) return;
    const positions = frets.filter(fret => fret > 0);
    const first = Math.min(...positions);
    const last = Math.max(...positions);
    if (last > maxFret || (positions.length && last - first > 3)) return;
    const open = frets.includes(0);
    const inversion = allowed.indexOf(sounded[0]);
    const base = positions.length ? first : 0;
    shapes.set(signature, {
      frets, open, base, inversion,
      name: name || (open ? "Open strings" : sounded.length === 3 ? "Movable triad" : "Movable voicing"),
      score: priority + base * .7 + inversion * 2 + (6 - sounded.length) * 2,
    });
  }

  for (const [tab, name] of common[notes[0] + kind] || []) {
    add(Array.from(tab, fret => fret === "x" ? -1 : Number(fret)), name, -200);
  }
  for (const shape of templates.filter(shape => shape.kind === kind)) {
    const start = (root - tuning[shape.root] - shape.frets[shape.root] + 72) % 12;
    for (let offset = start; offset <= maxFret; offset += 12) {
      const frets = shape.frets.map(fret => fret < 0 ? -1 : fret + offset);
      const name = offset === 0 ? "Open " + notes[0] + (kind === "m" ? " minor" : kind === "dim" ? " diminished" : "") : shape.name;
      add(frets, name, offset > 12 ? -35 : -100);
    }
  }

  for (let base = 1; base <= maxFret; base++) {
    const choices = tuning.map(midi => [-1, 0, base, base + 1, base + 2, base + 3]
      .filter(fret => fret === -1 || (fret <= maxFret && allowed.includes((midi + fret) % 12))));
    function visit(frets) {
      if (frets.length === 6) {
        if (!frets.includes(base)) return;
        const first = frets.findIndex(fret => fret >= 0);
        const last = frets.findLastIndex(fret => fret >= 0);
        const interiorMutes = frets.slice(first, last + 1).filter(fret => fret < 0).length;
        if (interiorMutes > 1) return;
        add(frets, null, interiorMutes * 8 + (frets.includes(0) && base > 4 ? 8 : 0));
        return;
      }
      for (const fret of choices[frets.length]) visit([...frets, fret]);
    }
    visit([]);
  }

  const result = [...shapes.values()].sort((a, b) => a.score - b.score);
  cache.set(cacheKey, result);
  return result;
}

const commonFingers = {
  "x32010": "032010", "332010": "432010", "xx0232": "000132",
  "xx0231": "000231", "022100": "023100", "022000": "023000",
  "xx3211": "003211", "133211": "134211", "320003": "320004",
  "320033": "210034", "x02220": "001230", "x02210": "002310",
  "x2343x": "012430",
};

const movableFingers = {
  "0,2,2,1,0,0": "134211", "0,2,2,0,0,0": "134111",
  "x,0,2,2,2,0": "013331", "x,0,2,2,1,0": "013421",
  "x,3,2,0,1,0": "043121", "x,x,0,2,3,2": "001243",
  "x,x,0,2,3,1": "001342", "x,0,1,2,1,x": "012430",
  "x,x,0,1,x,1": "001203", "3,2,0,0,0,3": "431112",
};

function fingering(frets) {
  const openShape = frets.map(fret => fret < 0 ? "x" : fret).join("");
  if (frets.every(fret => fret < 10) && commonFingers[openShape]) {
    return Array.from(commonFingers[openShape], Number);
  }
  const pressed = frets.map((fret, string) => ({fret, string})).filter(note => note.fret > 0);
  const base = Math.min(...pressed.map(note => note.fret));
  const relative = frets.map(fret => fret < 0 ? "x" : fret - base).join();
  if (!frets.includes(0) && movableFingers[relative]) {
    return Array.from(movableFingers[relative], Number);
  }
  pressed.sort((a, b) => a.fret - b.fret || a.string - b.string);
  const groups = [];
  const fingers = Array(6).fill(0);

  function assign(index) {
    if (index === pressed.length) return true;
    const {fret, string} = pressed[index];
    if (groups.length < 4) {
      groups.push({fret, string});
      fingers[string] = groups.length;
      if (assign(index + 1)) return true;
      groups.pop();
    }
    for (const [i, first] of groups.entries()) {
      if (first.fret !== fret || frets.slice(first.string, string + 1).some(value => value < fret)) continue;
      fingers[string] = i + 1;
      if (assign(index + 1)) return true;
    }
    fingers[string] = 0;
    return false;
  }

  return assign(0) ? fingers : null;
}

const fingerDialog = document.querySelector("#fingering");
const fingerTitle = document.querySelector("#finger-title");
const fingerShape = document.querySelector("#finger-shape");
const fingerDiagram = document.querySelector("#finger-diagram");
const fingerHelp = document.querySelector("#finger-help");
document.querySelector("#finger-close").onclick = () => fingerDialog.close();
fingerDialog.addEventListener("click", event => {
  if (event.target === fingerDialog) fingerDialog.close();
});

function showFingering(shape, notes, chord, fingers) {
  fingerTitle.textContent = chord;
  fingerShape.textContent = shape.name;
  fingerDiagram.innerHTML = drawDiagram(shape, notes, chord, true, fingers);
  fingerHelp.textContent = "1 Index · 2 Middle · 3 Ring · 4 Pinky";
  fingerDialog.showModal();
}

function drawDiagram(shape, notes, chord, enlarged = false, fingers = null) {
  const start = Math.max(1, enlarged || shape.frets.some(fret => fret > 4) ? shape.base : 1);
  const x = i => 22 + 15 * i;
  const y = 23;
  let drawing = "";
  for (let row = 0; row <= 4; row++) {
    const level = y + row * 16;
    drawing += '<line x1="22" x2="97" y1="' + level + '" y2="' + level + '" stroke-width="' + (start === 1 && row === 0 ? 3 : 1) + '"/>';
  }
  if (start > 1) drawing += '<text x="9" y="34" class="fret-number">' + start + '</text>';
  shape.frets.forEach((_, i) => {
    const col = x(i);
    drawing += '<line x1="' + col + '" x2="' + col + '" y1="23" y2="87"/>';
  });
  const center = fret => y + (fret - start + .5) * 16;
  if (fingers) {
    for (let finger = 1; finger <= 4; finger++) {
      const first = fingers.indexOf(finger);
      const last = fingers.lastIndexOf(finger);
      if (first < 0 || first === last) continue;
      const level = center(shape.frets[first]);
      drawing += `<line x1="${x(first)}" x2="${x(last)}" y1="${level}" y2="${level}" stroke="#a2b5a6" stroke-width="4"/>`;
    }
  }
  shape.frets.forEach((fret, i) => {
    const col = x(i);
    const label = enlarged ? (fret < 0 ? "×" : notes.find(note => pitch(note) === (tuning[i] + fret) % 12)) : strings[i];
    drawing += `<text x="${col}" y="104">${label}</text>`;
    const root = (tuning[i] + fret) % 12 === pitch(notes[0]);
    if (fret === -1) drawing += '<text x="' + col + '" y="15">×</text>';
    else if (fret === 0) drawing += '<circle cx="' + col + '" cy="12" r="3.6" fill="none" stroke="' + (root ? '#205340' : '#30352f') + '" stroke-width="' + (root ? 2 : 1) + '"/>';
    else drawing += '<circle cx="' + col + '" cy="' + center(fret) + '" r="5.3" fill="' + (root ? '#205340' : '#30352f') + '" stroke="none"/>';
    if (fingers?.[i]) {
      drawing += `<text x="${col}" y="${center(fret)}" fill="#fff" font-size="7.3" font-weight="700" dominant-baseline="central">${fingers[i]}</text>`;
    }
  });
  const description = shape.frets.map((fret, i) => strings[i] + " " + (fret < 0 ? "muted" : fret === 0 ? "open" : "fret " + fret + (fingers ? ", finger " + fingers[i] : ""))).join(", ");
  return '<svg viewBox="0 0 119 108" role="img" aria-label="' + chord + ', ' + description + '" stroke="#5b6359" text-anchor="middle" font-family="system-ui" font-size="9" fill="#30352f">' +
    '<style>text{stroke:none}</style>' + drawing + '</svg>';
}

function diagram(shape, notes, chord) {
  const tab = shape.frets.map(fret => fret < 0 ? "×" : fret).join(" · ");
  const position = shape.inversion ? " · " + (shape.inversion === 1 ? "1st inversion" : "2nd inversion") : "";
  return '<figure class="shape"><button type="button" class="shape-preview" aria-haspopup="dialog" aria-label="Enlarge ' +
    chord + ' diagram, ' + tab + '">' + drawDiagram(shape, notes, chord) + '</button><figcaption>' + shape.name + position +
    '</figcaption><span class="tab">' + tab + '</span><button class="listen" aria-label="Listen to ' + chord + ', ' + tab + '">▷ Listen</button></figure>';
}

async function play(frets) {
  audio ??= new AudioContext();
  await audio.resume();
  frets.forEach((fret, string) => {
    if (fret < 0) return;
    const start = audio.currentTime + string * .037;
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    const tone = audio.createBiquadFilter();
    oscillator.type = "triangle";
    oscillator.frequency.value = 440 * 2 ** ((tuning[string] + fret - 69) / 12);
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(3300, start);
    tone.frequency.exponentialRampToValueAtTime(700, start + .9);
    envelope.gain.setValueAtTime(.001, start);
    envelope.gain.linearRampToValueAtTime(.11, start + .007);
    envelope.gain.exponentialRampToValueAtTime(.001, start + 1.25);
    oscillator.connect(tone).connect(envelope).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 1.26);
  });
}

function drawChord(parent, chord, index, notes) {
  const section = document.createElement("section");
  section.className = "chord";
  section.id = "chord-" + index;
  section.innerHTML = '<div class="chord-head"><div class="chord-heading"><span class="degree">' + degrees[index] +
    '</span><h3>' + chord + '</h3></div><p class="tones">' + qualities[index] + ' triad · ' + notes.join(" – ") +
    '</p></div><div class="shapes"></div>';
  parent.append(section);
  const shapes = voicings(notes, suffixes[index]).filter(shape =>
    filter === "all" || shape.open === (filter === "open"));
  const grid = section.querySelector(".shapes");
  const visibleShapes = [];
  for (const shape of shapes) {
    const fingers = fingering(shape.frets);
    if (!fingers) continue;
    visibleShapes.push({shape, fingers});
    if (visibleShapes.length === pageSize) break;
  }
  if (!visibleShapes.length) {
    grid.outerHTML = '<p class="empty">No matching shapes for this chord.</p>';
    return;
  }
  grid.innerHTML = visibleShapes.map(({shape}) => diagram(shape, notes, chord)).join("");
  grid.querySelectorAll(".shape-preview").forEach((button, i) => {
    const {shape, fingers} = visibleShapes[i];
    button.onclick = () => showFingering(shape, notes, chord, fingers);
  });
  grid.querySelectorAll(".listen").forEach((button, i) => {
    button.onclick = () => play(visibleShapes[i].shape.frets).catch(() => { button.textContent = "Audio unavailable"; });
  });
}

function render() {
  const notes = scales[selected].split(" ");
  const names = notes.map((note, i) => note + suffixes[i]);
  document.querySelector("#key-title").textContent = notes[0] + " major";
  document.querySelector("#scale").textContent = notes.join(" · ");
  document.querySelector("#degrees").innerHTML = names.map((name, i) =>
    '<a href="#chord-' + i + '"><small>' + degrees[i] + '</small>' + name + '</a>').join("");
  document.querySelectorAll("#keys button").forEach(button => button.setAttribute("aria-pressed", button.dataset.key === selected));
  document.querySelectorAll("#filters button").forEach(button => button.setAttribute("aria-pressed", button.dataset.filter === filter));
  const chords = document.querySelector("#chords");
  chords.replaceChildren();
  names.forEach((name, i) => drawChord(chords, name, i, [notes[i], notes[(i + 2) % 7], notes[(i + 4) % 7]]));
}

const keys = document.querySelector("#keys");
for (const [key, scale] of Object.entries(scales)) {
  const button = document.createElement("button");
  button.dataset.key = key;
  button.textContent = scale.split(" ")[0];
  button.setAttribute("aria-label", button.textContent + " major");
  button.onclick = () => {
    if (selected === key) return;
    selected = key;
    const url = new URL(location.href);
    url.hash = "";
    url.searchParams.set("key", key);
    history.pushState(null, "", url);
    render();
  };
  keys.append(button);
}
document.querySelectorAll("#filters button").forEach(button => {
  button.onclick = () => {
    filter = button.dataset.filter;
    render();
  };
});
window.addEventListener("popstate", () => {
  const key = readKey();
  if (key === selected) return;
  selected = key;
  render();
});
render();
