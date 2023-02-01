import { Note, Key, ChordType, Chord, Scale, ScaleType } from '@tonaljs/tonal';
import { renderAbc } from 'abcjs';
import { random, shuffle } from 'lodash';
import { abcFormatNotes, notesListToABCStr, randomListItem } from '.';

export function getRandomInteger(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
  }

export const colors = {
	"a": "#9437FF",
	"a#": "#FF40FF",
	"bb": "#FF40FF",
	"b": "#FF2F92",
	"b#": "#FF2600", 
	"cb": "#FF2F92",
	"c": "#FF2600",
	"c#": "#FF9300",
	"db": "#FF9300", 
	"d": "#FFFB00",
	"d#": "#8EFA00",
	"eb": "#8EFA00",
	"e": "#00F900",
	"e#": "#00FA92",
	"fb": "#00F900",
	"f": "#00FA92",
	"f#": "#00FDFF",
	"gb": "#00FDFF",
	"g": "#0096FF",
	"g#": "#0433FF",
	"ab": "#0433FF",
}

export function lightenHex(color, amount) {
	//https://stackoverflow.com/questions/5560248/programmatically-lighten-or-darken-a-hex-color-or-rgb-and-blend-colors
	return '#' + color.replace(/^#/, '').replace(/../g, color => ('0'+Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}

export function getNoteColorWithRandomShade(note, amount=15) {
	const shade = getRandomInteger(-amount, amount)
	return lightenHex(colors[note], shade)
}

export function stringListToString(lst, spacer=" ") {
	let s = ""
	for (let i=0; i<lst.length; i++) {
		s += lst[i]

		if (i != lst.length) {
			s += spacer
		}
	}
	return s
}

// avoid these chords
const blacklist = ['b9sus', '69#11', 'm69', '9sus']

const TARGET_TYPE_CHORD = "chord"
const TARGET_TYPE_SCALE = "scale"
const TARGET_TYPE_ARPEGGIO = "arpeggio"

const complexityFilter = {
	simple: (c) => ['Major', 'Minor'].includes(c.quality) && c.name,
	intermediate: (c) => c.name,
	hard: (c) => c,
};

export function listInList(a, b) {
	// Return true if all elements of a are in b, false otherwise
	for (let i=0; i<a.length; i++) {
		if (!b.includes(a[i])) {
			return false
		}
	}
	return true
}

function notesInNotesChroma(a, b) {
	return listInList(
		a.map(n => Note.get(n).chroma),
		b.map(n => Note.get(n).chroma)
	)
}

function getEnharmonicNote(note) {
	return Note.enharmonic(note).toLowerCase();
}

// random targets
const getChordTarget = (settings) => {

	const scale = Scale.get(`${settings.modeKey} ${settings.scaleMode}`)

	let randomNote
	let validChordTypes


	if (settings.playInModes) {
		const scaleChordTypes = Scale.scaleChords(`${settings.scaleMode}`) 
		const potentialChords =  (() =>{
			let l = []
			for (let i=0; i< scaleChordTypes.length; i++) {
				for (let j=0; j < scale.notes.length; j++) {
					l.push(Chord.get(`${scale.notes[j]} ${scaleChordTypes[i]}`))		
				}
			}
			return l
		})()


		validChordTypes = potentialChords
			.filter(c => notesInNotesChroma(c.notes, scale.notes) )
			.filter(complexityFilter[settings.chordComplexity])
			.filter((c) => c.intervals.length <= parseInt(settings.chordLength))
			// .map((c) => c.aliases[0])
			.filter(c => !blacklist.includes(c.quality))

		const chosenChord = randomListItem(validChordTypes)
		

		return {
			root: chosenChord.tonic,
			quality: chosenChord.aliases[0],
		}
	}

	else {
		randomNote = randomListItem(settings.chordRoots);
		validChordTypes = ChordType.all() 


		validChordTypes = validChordTypes
			.filter(complexityFilter[settings.chordComplexity])
			.filter((c) => c.intervals.length <= parseInt(settings.chordLength))
			.map((c) => c.aliases[0])
			.filter(c => !blacklist.includes(c.quality))

		const randomType = randomListItem(validChordTypes)

		return {
			root: randomNote,
			quality: randomType,
		};
	}
};

const getScaleTarget = (settings) => {
	let randomNote
	let randomScale
	
	if (settings.playInModes) {
		randomNote = settings.modeKey
		randomScale = settings.scaleMode 
	}
	else {
		randomNote = randomListItem(settings.chordRoots);
		const validScaleTypes = ScaleType.all()
			.map(s => s.name)
			.filter(c => !blacklist.includes(c))

		randomScale = randomListItem(validScaleTypes);
	}


	return {
		root: randomNote,
		scale: randomScale,
	};
};


function linearSortNotes(notes, ascending) {
	// make notes in a straight line
	const ret = []
	const firstOctave = notes[0].oct
	const firstChroma = notes[0].chroma

	if (firstChroma == 0 || firstChroma == 1) {
		return notes
	}

	if (ascending) {
		for (let i=0; i<notes.length; i++) {
			if (notes[i].chroma < firstChroma) {
				ret.push( Note.get(`${notes[i].pc}${firstOctave+1}`) )
			} else {
				ret.push( notes[i])
			}
		}
	} else {
		for (let i=0; i<notes.length; i++) {
			if (notes[i].chroma > firstChroma) {
				ret.push( Note.get(`${notes[i].pc}${firstOctave-1}`) )
			} else {
				ret.push( notes[i])
			}
		}
	}
	return ret
}

export default class Target {
	static all = []

	static targetsEl = document.querySelector('.targets');

	constructor(type, root, quality, speed, onFall, colorProbability, notes, intervals, scoreProbability, intervalProbability) {
		this._id = Date.now()
		this.root = root;
		this.quality = quality;
		this.target = root + quality;
		this.speed = speed;
		this.colorProbability = colorProbability
		this.scoreProbability = scoreProbability
		this.intervalProbability = intervalProbability
		this.shuffleProbability = 1.0
		this.intervals = intervals


		// allows Target to be type: "chord", "arpeggio", or "scale"
		this.type = type
		this.notes = notes
		this.notesShot = []

		if (this.type == TARGET_TYPE_CHORD) {
			this.renderChord();
		} else {
			this.renderNotes()
		}
		
		this.invaded = this.animation.finished;
	}


	static create(settings) {
		// create random target from game modes
		let mode = randomListItem(settings.gameModes)
		
		if (mode === TARGET_TYPE_CHORD) {
			return this.createChord(settings)
			
		} else if (mode === TARGET_TYPE_SCALE) {
			const scale = this.createScale(settings)
			return scale

		} else if (mode === TARGET_TYPE_ARPEGGIO) {
			return this.createArpeggio(settings)
		}

	}

	static createChord(settings) {
		const { root, quality } = getChordTarget(settings);

		let chord = Chord.get(root + quality)
		let notes = chord.notes
		let intervals = chord.intervals

		const newTarget = new Target(TARGET_TYPE_CHORD, root, quality, settings.speed, 
			null, settings.colorProbability, notes, intervals, settings.scoreProbability, settings.intervalProbability);

		Target.all.push(newTarget);

		return newTarget;
	}

	static createArpeggio(settings) {
		const { root, quality } = getChordTarget(settings);


		let chord = Chord.get(root + quality)
		let notes = chord.notes
		let intervals = chord.intervals

		const newTarget = new Target(TARGET_TYPE_ARPEGGIO, root, quality, settings.speed, 
			null, settings.colorProbability, notes, intervals, settings.scoreProbability, settings.intervalProbability);

		Target.all.push(newTarget);

		return newTarget;
	}

	static createScale(settings) {
		const { root, scale } = getScaleTarget(settings);

		let scaleObj = Scale.get(root + " "  + scale)
		let notes = scaleObj.notes
		let intervals = scaleObj.intervals

		const newTarget = new Target(TARGET_TYPE_SCALE, root, scale, settings.speed, 
			null, settings.colorProbability, notes, intervals, settings.scoreProbability, settings.intervalProbability);

		Target.all.push(newTarget);

		return newTarget;
	}


	static shootNotes(notes) {
		const target = Target.all[0]

		if (target && (target.type == TARGET_TYPE_ARPEGGIO || target.type == TARGET_TYPE_SCALE)) {
			target.notesShot = target.notesShot.concat(notes)

			if (notesInNotesChroma(target.notes, target.notesShot)) {
				target.animation.cancel();
				target.remove();
				return true;
			}
		} else if (target && target.type == TARGET_TYPE_CHORD) {
			// check if equivalent notes submitted
			if (notesInNotesChroma(target.notes, notes) && notesInNotesChroma(notes, target.notes)) {
				target.animation.cancel();
				target.remove();
				return true;
			}

		}
		return false;
	}

	remove() {
		this.el.parentElement.removeChild(this.el);
		Target.all = Target.all.filter(t => t._id !== this._id)
	}

	static clear() {
		
		for (let i=0 ;i<Target.all.length; i++) {
			const target = Target.all[i]
			target.animation.cancel();
			// target.remove();
			target.el.parentElement.removeChild(target.el);
		}
		Target.all = []
		
	}

	



	async renderChord() {
		const targetEl = document.createElement('div');
		if (this.quality === 'M') {
			targetEl.innerHTML = `<div class="target__root">${this.root}</div>`;
		} else {
			targetEl.innerHTML = `<div class="target__root">${this.root}</div><div class="target__quality">${this.quality}</div>`;
		}
		targetEl.classList.add('target');
		targetEl.style.left =
			Math.floor(
				Math.random() * (document.body.offsetWidth - targetEl.clientWidth - 120)
			) + 'px';
		Target.targetsEl.prepend(targetEl); // add element to the front of stack (first in is rendered on top)
		this.animation = targetEl.animate(
			[
				{ transform: 'translateY(0)' },
				{
					transform: `translateY(calc(100vh - ${targetEl.clientHeight + 2}px)`,
				},
			],
			{
				// timing options
				duration: parseInt(this.speed),
				fill: 'forwards',
			}
		);
		this.el = targetEl;

		// add note specific color
			
		const tonic = Chord.get(this.target).tonic
		const keyEnharnomic = getEnharmonicNote(tonic)

		
		// font color
		function hex_is_light(color) {
			const hex = color.replace('#', '');
			const c_r = parseInt(hex.substr(0, 2), 16);
			const c_g = parseInt(hex.substr(2, 2), 16);
			const c_b = parseInt(hex.substr(4, 2), 16);
			const brightness = ((c_r * 299) + (c_g * 587) + (c_b * 114)) / 1000;
			return brightness > 155;
		}
		

		let notes = Chord.get(this.target).notes
		
		// give notes all octave
		const randomOctave = randomListItem([1, 2, 3, 4, 5, 6])
		for (let i=0; i<notes.length; i++) {
			notes[i] = Note.get(`${notes[i]}${randomOctave}`)
		}

		// display in ascending or descending, or shuffled order 
		// give them all octave
		if (Math.random() < this.shuffleProbability) {
			notes = shuffle(notes) 
		} else {
			if (Math.random() > 0.5) {
				notes = notes.reverse()
				notes = linearSortNotes(notes, false)
			} else {
				notes = notes
				notes = linearSortNotes(notes, true)
			}
			
		}

	

		if (Math.random() < this.colorProbability) { 
			 // remove root
			notes = notes.filter(n => n.pc != tonic)

			if (hex_is_light(colors[keyEnharnomic])) {
				targetEl.style.color = "#2c3e50"
			} else {
				targetEl.style.color = "#ecf0f1"
			}
			const keyColor = getNoteColorWithRandomShade(keyEnharnomic)
			targetEl.style.backgroundColor = keyColor

			// add a colored border for every non-root note in chord
			let boxShadow = ""
			
			for (let n=0; n<notes.length; n++) {
				const color = getNoteColorWithRandomShade(getEnharmonicNote(notes[n].pc))
				boxShadow = boxShadow + `0 0 0 ${(n+1)*15}px ${color}, `
			}
			
			// add outside-most black border
			boxShadow = boxShadow + `0 0 0 ${(notes.length*15)-12}px ${'rgb(0, 0, 0, 0.5)'}`

			// boxShadow = boxShadow.slice(0, boxShadow.length-2)
			targetEl.style.boxShadow = boxShadow

			targetEl.style.borderColor = "rgb(0, 0, 0, 0)" // clear border
			targetEl.style.height = "70px"
			targetEl.style.width = "70px"

		}  
		else if (Math.random() < this.intervalProbability) { 
			// draw as intervals
			this.intervals = shuffle(this.intervals)

			const intervalsString = document.createElement('p')
			intervalsString.innerText = stringListToString(this.intervals)
			targetEl.appendChild(intervalsString)

			intervalsString.classList.add('intervalsString')
			
			targetEl.style.border = 'medium solid blue'
		}

		else if (Math.random() < this.scoreProbability) {
			let scoreDiv = document.createElement('div')
			scoreDiv.classList.add('targetScoreDiv')

			// draw as score
			const abcString = abcFormatNotes(notes, false, false)
			
			// add num of cols as parameter to css
			scoreDiv.style +=`;--numCols: ${1};`

			renderAbc(scoreDiv, abcString, {
				add_classes: true, // add css classes to all elements
				scale: 1.5,
			});

			targetEl.appendChild(scoreDiv)
			
			targetEl.style.border = 'medium solid blue'
		}

		else {
			targetEl.style.boxShadow = 	`0 0 0 ${3}px ${'rgb(0, 0, 0, 0.5)'}`
			targetEl.style.border = 'medium solid blue'
			targetEl.style.width = "70px"
			targetEl.style.height = targetEl.style.width

		}
		
	}

	async renderNotes() {
		const targetEl = document.createElement('div');
		if (this.quality === 'M') {
			targetEl.innerHTML = `<div class="target__root">${this.root}</div>`;
		} else {
			targetEl.innerHTML = `<div class="target__root">${this.root}</div><div class="target__quality">${this.quality}</div>`;
		}
		targetEl.classList.add('target');
		targetEl.style.left =
			Math.floor(
				Math.random() * (document.body.offsetWidth - targetEl.clientWidth - 850)
			) + 300 + 'px';
		Target.targetsEl.prepend(targetEl);
		this.animation = targetEl.animate(
			[
				{ transform: 'translateY(0)' },
				{
					transform: `translateY(calc(100vh - ${targetEl.clientHeight + 2}px)`,
				},
			],
			{
				// timing options
				duration: parseInt(this.speed),
				fill: 'forwards',
			}
		);
		this.el = targetEl;


		// custom styling css : add note specific color

		targetEl.style.borderRadius = '0%' // make square not circle
		targetEl.style.padding = '20px 50px'
			
		let notes = this.notes;


		
		// give notes all octave
		const randomOctave = randomListItem([1, 2, 3, 4, 5, 6])
		for (let i=0; i<notes.length; i++) {
			notes[i] = Note.get(`${notes[i]}${randomOctave}`)
		}

		// display in ascending or descending, or shuffled order 
		// give them all octave
		if (Math.random() < this.shuffleProbability) {
			notes = shuffle(notes) 
		} else {
			if (Math.random() > 0.5) {
				notes = notes.reverse()
				notes = linearSortNotes(notes, false)
			} else {
				notes = notes
				notes = linearSortNotes(notes, true)
			}
			
		}


		

		// prob draw as score or colours/labels
		if (Math.random() < this.colorProbability) {
			// make box of colored squares (rep'nting notes ) and render below target name
			const paletteEl = document.createElement('div');
			paletteEl.classList.add('targetNotesPalette')

			for (let n=0; n<notes.length; n++) {
				const note = notes[n].pc
				const color = getNoteColorWithRandomShade(Note.enharmonic(note).toLowerCase())
				//const isHit = this.notesShot.map(n => Note.get(n).chroma).includes(Note.get(note).chroma)

				let noteEl = document.createElement('div');
				noteEl.classList.add('targetPaletteEl')
				noteEl.style.backgroundColor = color

				// add note name inside
				let noteNameDiv = document.createElement('p')
				noteNameDiv.classList.add('targetNoteName')
				noteNameDiv.innerText = note
				noteEl.appendChild(noteNameDiv)

				paletteEl.appendChild(noteEl)			
			}
			targetEl.style.border = 'medium dashed purple'

			targetEl.appendChild(paletteEl)
		}
		else if (Math.random() < this.intervalProbability) { 
			// draw as intervals

			this.intervals = shuffle(this.intervals)

			const intervalsString = document.createElement('p')
			intervalsString.innerText = stringListToString(this.intervals)
			targetEl.appendChild(intervalsString)

			intervalsString.classList.add('intervalsString')
			
			targetEl.style.border = 'medium dashed purple'
		}
		else if (Math.random() < this.scoreProbability) {
			let scoreDiv = document.createElement('div')
			scoreDiv.classList.add('targetScoreDiv')
			
			const abcString = abcFormatNotes(notes, true, true)
			
			// add num of cols as parameter to css
			scoreDiv.style +=`;--numCols: ${notes.length};`

			renderAbc(scoreDiv, abcString, {
				add_classes: true, // add css classes to all elements
				scale: 1.0,
			});

			targetEl.appendChild(scoreDiv)
			targetEl.style.border = 'medium dashed purple'
		}
		else {
			targetEl.style.border = 'medium dashed purple'
		}

	}
}
