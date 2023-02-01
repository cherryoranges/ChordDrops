import MIDIInput from './MIDIInput';
import Piano from './Piano';
import Target, { colors } from './Target';
import { Note, Key, ChordType, Chord, ScaleType, Scale } from '@tonaljs/tonal';
import * as Tone from 'tone';
import abcjs from 'abcjs'
import renderAbc from 'abcjs/src/api/abc_tunebook_svg';
import { sum } from 'lodash';


function removeAllChildNodes(parent) {
    while (parent.firstChild) {
        parent.removeChild(parent.firstChild);
    }
}

// show chord on music score
export function notesListToABCStr(notes, make_intervals=false) {
	let x = "" 
	let closeInterval = [false, 0] // when [0] true writes `]` to end of string to create interval
	for (let i=0; i<notes.length; i++) {
		let note = notes[i].pc

		const shiftFrom4 = 4 - notes[i].oct
		
		// convert accidentals
		while (note.includes('#')) {
			// move accidental to front of note
			note = note.replace('#', '')
			note = '^' + note
		}

		while (note.includes('b')) {
			// move accidental to front of note
			note = note.replace('b', '')
			note = '_' + note
		}

		const octaveString = shiftFrom4 > 0 ? ','.repeat(Math.abs(shiftFrom4)) : "'".repeat(Math.abs(shiftFrom4))

		if (make_intervals) {
			const makeIntervalProb = 0.5
			if (Math.random() < makeIntervalProb && !closeInterval[0]) {
				closeInterval = [true, i]
				x = x + "["
			}
		}
		
		x = x + note + octaveString + " "

		if (make_intervals){
			// close interval 
			if (closeInterval[0] && closeInterval[1] != i) {
				closeInterval = [false, i]
				x = x + "]"
			}
		}
	}
	return x
}

export function abcFormatNotes(notes, arpeggiate=false, make_intervals=false) {
	let octave = notes[0].oct
	let randomClef = randomListItem(['clef=bass', 'clef=alto', 'C'])

	if (octave < 3 && randomClef == "C") { randomClef = Math.random() > 0.5 ? 'clef=bass' : 'clef=alto' } 
	if (octave  < 2) { randomClef = 'clef=bass' } // fprce pit;osers
	if (octave  > 4) { randomClef = 'C' } 
	

	if (arpeggiate) {
		return `X:1\nK:${ randomClef }\n${notesListToABCStr(notes, make_intervals)}|\n`;
	} else {
		return `X:1\nK:${ randomClef }\n[${notesListToABCStr(notes, make_intervals)}]|\n`;
	}
}

export function randomListItem(items) {
	return items[Math.floor(Math.random()*items.length)];
}

function getRandomInt(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
  }


  function LightenDarkenColor(col,amt) {
    var usePound = false;
    if ( col[0] == "#" ) {
        col = col.slice(1);
        usePound = true;
    }

    var num = parseInt(col,16);

    var r = (num >> 16) + amt;

    if ( r > 255 ) r = 255;
    else if  (r < 0) r = 0;

    var b = ((num >> 8) & 0x00FF) + amt;

    if ( b > 255 ) b = 255;
    else if  (b < 0) b = 0;

    var g = (num & 0x0000FF) + amt;

    if ( g > 255 ) g = 255;
    else if  ( g < 0 ) g = 0;

    return (usePound?"#":"") + (g | (b << 8) | (r << 16)).toString(16);
}

export function randomListSample(from, num) {
	let m = []
	for (let i=0; i<num; i++) {
		m.push(randomListItem(from))
	}
	return m
}

class Game {
	constructor() {
		this.els = {
			currentChord: document.querySelector('.currentChord'),
			targets: document.querySelector('.targets'),
			startButton: document.querySelector('.start-game'),
			level: document.querySelector('.level .value'),
			score: document.querySelector('.score .value'),
			error: document.querySelector('.error'),
			info: document.querySelector('.errorInfo'),
			hearts: document.querySelector('.hearts'),
			musicScore: document.querySelector('.musicScore'),
			scaleModeInfo: document.querySelector('.scaleModeInfo'),
			scaleSelect: document.getElementById('scales'),
		};

		this.piano = new Piano();
		this.input = new MIDIInput({
			onChange: this.onChange.bind(this),
			onNoteOn: this.piano.noteOn.bind(this.piano),
			onNoteOff: this.piano.noteOff.bind(this.piano),
			onError: this.onError.bind(this),
		});
		this.els.startButton.addEventListener('click', this.start.bind(this));
		
		this.gameLoop = null;

		this.hearts = 3
		this.heartsStart = 3

		// load game sounds
		this.gameSounds = {
			"success": new Tone.Player("http://localhost:1234/static/sounds/success.mp3").toDestination(),
			"fail": new Tone.Player("http://localhost:1234/static/sounds/fail.mp3").toDestination(),
			"gameover": new Tone.Player("http://localhost:1234/static/sounds/gameover.mp3").toDestination(),
			"levelup": new Tone.Player("http://localhost:1234/static/sounds/levelup.mp3").toDestination(),
			"gong": new Tone.Player("http://localhost:1234/static/sounds/gong.mp3").toDestination()
		}

		this.gameOn = false

		this.instruments = [null, null, null]
		this.playInstrumentsProcess = null

		this.refreshScalesForm()
	}

	refreshScalesForm() {
		// load default scale options into html form
		const allScales = ScaleType.names()
		const majorModeScales = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian']
		const mainScales = [
			'ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian',  
			"major pentatonic", "minor pentatonic",
			"major blues", "minor blues", 
			"melodic minor", "harmonic minor", 
			"diminished", "augmented", "altered",
			"whole tone", 
		]
		
		for (let i=0; i<allScales.length; i++) {
			const scale = allScales[i]
			const option = document.createElement('option')
			option.text = scale
			this.els.scaleSelect.add(option)

			// select all mainScales by default
			if (mainScales.includes(scale)) {
				option.selected = true
			}

			// randomly select some more scales
			if (Math.random() < 0.2) {
				option.selected = true
			}

			// randomly deselect 
			if (Math.random() < 0.2) {
				option.selected = false
			}
		}
	}

	start() {
		this.gameOn = true;

		document.body.classList.add('started');
		this.settings = {
			gameModes: [
				...document.querySelector('#game-modes').selectedOptions,
			].map((o) => o.value),
			chordLength: document.querySelector('#chord-length').value,
			chordComplexity: document.querySelector('#chord-complexity').value,
			speed: document.querySelector('#chord-pace').value,
			spawnRate: document.querySelector('#spawn-rate').value,
			chordRoots: [
				...document.querySelector('#chord-roots').selectedOptions,
			].map((o) => o.value),
			inversions: document.querySelector('#inversions').value === "Active",
			colorProbability: document.querySelector('#color-prob').value / 100.0,
			scoreProbability: document.querySelector('#score-prob').value / 100.0,
			intervalProbability: document.querySelector('#interval-prob').value / 100.0,
			playMidiInput: document.querySelector('#playMidiInput-checkbox').checked,
			useHearts: document.querySelector('#hearts-checkbox').checked,
			playInModes: document.querySelector('#modes-checkbox').checked,
			scaleMode: null,
			modeKey: null,
		};


		
		this.changeBackgroundColor()

		if (this.settings.playInModes) {
			this.changeScaleMode()
		}
		this.resetScore();
		this.resetLevel();
		
		this.piano.start();
		this.piano.playSound = this.settings.playMidiInput

		// set spawn rate of targets
		this.createTargetRateStart = this.settings.spawnRate
		this.currentCreateTargetRate = this.createTargetRateStart; // start at 5 seconds

		this.createTarget();
		this.gameLoop = setTimeout(() => { this.loop() }, this.currentCreateTargetRate);
		
		this.hearts = this.heartsStart

		this.drawHearts()	

		this.gameSounds.gong.start();
		

	
	}

	changeBackgroundColor(colors=["#FFF"]) {
		let color = randomListItem(colors)
		//color = LightenDarkenColor(color,70 + Math.random()*30)
		document.querySelector('html').style.backgroundColor = color
	}

	changeScaleMode() {
		if (this.settings.playInModes) {
			// random new scale
			const allScales = ScaleType.names()
			const majorModeScales = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian']
			const mainScales = [
				'ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian',  
				"major pentatonic", "minor pentatonic",
				"major blues", "minor blues", 
				"melodic minor", "harmonic minor", 
				"diminished", "augmented", "altered",
				"whole tone", 
			]

			// select scales to use
			let fromScales = mainScales	

			// filter out scales for which little/no chords exist
			const blacklist = ['locrian 6', 'piongio']
			fromScales = fromScales.filter(s => Scale.get(s).intervals.length > 5)
			fromScales = fromScales.filter(s => !blacklist.includes(s))

			this.settings.scaleMode = randomListItem(fromScales)
			this.settings.modeKey = randomListItem(this.settings.chordRoots)
			const scale = Scale.get(`${this.settings.modeKey} ${this.settings.scaleMode}`)

			
			// update dom
			const nameText = document.createElement('div');
			nameText.textContent = scale.name
			nameText.classList.add('scaleModeInfoText')
			const colorDiv = ((notes, colors) => {
				const paletteEl = document.createElement('div');
				paletteEl.classList.add('notesPalette')

				for (let n=0; n<notes.length; n++) {
					const note = notes[n]
					let color = colors[Note.enharmonic(note).toLowerCase()]
					//const isHit = this.notesShot.map(n => Note.get(n).chroma).includes(Note.get(note).chroma)

					let noteEl = document.createElement('div');
					noteEl.classList.add('paletteEl')
					noteEl.style.backgroundColor = color

					// add note name inside
					let noteNameDiv = document.createElement('p')
					noteNameDiv.classList.add('targetNoteName')
					noteNameDiv.innerText = note
					noteEl.appendChild(noteNameDiv)


					paletteEl.appendChild(noteEl)			
				}

				// border of pallete is root note color
				const rootColor = colors[Note.enharmonic(this.settings.modeKey).toLowerCase()];
				paletteEl.style.border = "20px solid " + rootColor


				return paletteEl
			})(scale.notes, colors)


			while (this.els.scaleModeInfo.firstChild) { // clear existing
				this.els.scaleModeInfo.firstChild.remove()
			}
			this.els.scaleModeInfo.appendChild(nameText)
			this.els.scaleModeInfo.appendChild(colorDiv)

			// change background color to root note color
			const rootNoteColor = colors[Note.enharmonic(this.settings.modeKey).toLowerCase()]
			this.changeBackgroundColor(['#FFF'])

			// let color = [colors[Note.enharmonic(this.settings.modeKey).toLowerCase()]]
			// color = LightenDarkenColor(color, 4)
			// console.log(color)
			// document.querySelector('html').style.backgroundColor = `#${color}`

			// play drone sound 
			// drone bass note 
			// and arpeggiate scale
			
			clearInterval(this.playInstrumentsProcess)



			this.instruments = [[], [], []]

			for (var i=0; i<3; i++) {
				for (var j=0; j<13; j++){
					this.instruments[i].push( this.piano.getRandomInstrument() )
				}
			}

			// random seed
			var seededRandom = new Math.seedrandom(this.seed);
			function randomVelocity() {
				return seededRandom()
			}

			const durInterval = randomListItem([500, 1000, 2000, 4000])
			this.playInstrumentsProcess = setInterval(() => {
				// play bass note
				const bassOctave = randomListItem([ 0, 1,])


				this.instruments[0].map(inst => inst.triggerAttack(Note.enharmonic(this.settings.modeKey)+bassOctave, Tone.now(), 0.5, randomVelocity()))
				this.instruments[0].map(inst => inst.triggerRelease(Note.enharmonic(this.settings.modeKey)+bassOctave, 
					Tone.now() + durInterval/1000))
				
				// // play scale
				// pick direction
				const scaleOctave = randomListItem([2, 3])
				const notesToPlay = Math.random() > 0.5 ? scale.notes : [].concat(scale.notes).reverse()
				const dur = durInterval / 1000 / scale.notes.length 
				for (var i=0; i< scale.notes.length; i++) {
					console.log(Tone.now()+ dur*i)
					this.instruments[1].map(inst => inst.triggerAttack(Note.enharmonic(notesToPlay[i])+scaleOctave, 
						Tone.now()+ dur*i, 0.3, randomVelocity()))
					this.instruments[1].map(inst => inst.triggerRelease(Note.enharmonic(notesToPlay[i])+scaleOctave, 
					 	Tone.now() + dur*i + dur))
				}

			}, durInterval) 
			
			// play constant melody
			clearInterval(this.playMelodyProcess)
			const numNotesInMelody = getRandomInt(8, 16)
			const melody = randomListSample(scale.notes, numNotesInMelody)
			const melodyNoteDurs = randomListSample([0, 250, 500, 1000, 2000,], numNotesInMelody)
			const melodyTotalDur = sum(melodyNoteDurs)
			

			this.playMelodyProcess = setInterval(() => {
				const melodyOctave = randomListItem([3,4 ])

				for (let i=0; i< melody.length; i++) {
					this.instruments[2].map(inst => inst.triggerAttack(Note.enharmonic(melody[i])+melodyOctave, 
						Tone.now()+ sum(melodyNoteDurs.slice(0, i))/1000, 0.3, randomVelocity()))
					this.instruments[2].map(inst => inst.triggerRelease(Note.enharmonic(melody[i])+melodyOctave, 
						Tone.now() +  (sum(melodyNoteDurs.slice(0, i)) + melodyNoteDurs[i])/1000))
				}
			}, melodyTotalDur)

		}
	}

	drawHearts() {
		// update display
		removeAllChildNodes(this.els.hearts) // clear

		if (this.settings.useHearts){
			for (let h=0; h<this.heartsStart; h++) {
				const img = document.createElement('img')
				img.classList.add('heart')
				
				// empty heart
				if (h >= this.hearts) {
					img.src = 'http://localhost:1234/static/images/heart-empty.png'
				} else {
					img.src = 'http://localhost:1234/static/images/heart-filled.png'
				}

				
				this.els.hearts.appendChild(img) // insert
			}
		}
	}
	lowerHearts() {
		if (this.hearts > 0) {
			this.hearts--
			this.drawHearts()

		} 
		if (this.hearts <= 0) {
			this.gameOver()
		}
	}

	async loop() {
		this.createTarget();
		this.gameLoop = setTimeout(() => { this.loop() }, this.currentCreateTargetRate);
	}

	async createTarget() {
		try {
			const target = Target.create(this.settings);

			// upon touching ground game over
			await target.invaded;
			

			this.gameOver()

		} catch (err) { }
	}

	gameOver() {
		clearTimeout(this.gameLoop);

		clearInterval(this.playInstrumentsProcess)
		clearInterval(this.playMelodyProcess)

		const lastTarget = Target.all[0]
		this.els.info.textContent = "The 💀 drop was " + lastTarget.target 
		this.els.error.textContent = "🎉 Score: " + this.score 

		console.log("The 💀 drop")
		console.log(lastTarget)
		lastTarget.notes.map(n => console.log(n.name))

		this.gameOn = false
		this.gameSounds.gameover.start()

		document.body.classList.remove('started');
		Target.clear();

		
		this.resetScore();
		this.resetLevel();

		this.hearts = this.heartsStart


		this.currentCreateTargetRate = this.createTargetRateStart
	}

	incrementScore() {
		this.score++;
		this.els.score.textContent = this.score;
	}

	resetScore() {
		this.score = 0;
		this.els.score.textContent = this.score;
	}

	incrementLevel() {
		Target.clear()
		
		this.gameSounds.levelup.start()
		this.changeBackgroundColor()

		this.hearts = this.heartsStart
		this.drawHearts()

		this.changeScaleMode()

		this.piano.newCurrentInstrument()

		

		this.level++;
		this.els.level.textContent = this.level;
		this.currentCreateTargetRate = this.currentCreateTargetRate * 0.9;
	}

	resetLevel() {
		this.level = 1;
		this.els.level.textContent = this.level;
		this.currentCreateTargetRate = this.createTargetRateStart
		
		Target.clear();
		Target.all = []
	}

	onError(error) {
		this.els.startButton.setAttribute('disabled', 'disabled');
		this.els.error.textContent = error;
	}

	async onChange({ notes, chords }) {
		
		if (notes.length > 0 ) {
			// show name of chord immediatley
			this.els.currentChord.textContent = (chords[0] || '').replace(
				/(.*)M$/,
				'$1'
			);

			// Draw chord on score
			
			const abcString = abcFormatNotes(notes.map(n => Note.get(`${n}${4}`)), false)
			renderAbc(this.els.musicScore, abcString, {
				add_classes: true, // add css classes to all elements
				scale: 3,
			});
		}

		function get_inversion(chord) {
			if (!chord.includes("/")) {
				return chord
			}
			

			const chars = chord.split("/")
			
			
			const lastChar = chars[chars.length - 1]

			// console.log(`last char: ${lastChar} note: ${Note.get(lastChar).chroma}`)
			
			if (Note.get(lastChar).chroma >= 0) {
				// remove slash chord from chord name 
				return chord.slice(0, -(lastChar.length+1))

			} else {
				return chord
			}
		}
		
		if (this.gameOn) {
				
			let wasHit = false
			
			// Shoot chords
			if (this.settings.gameModes.includes("chord")) {
				wasHit = Target.shootNotes(notes)
			}

			// Shoot notes
			// if (notes.length == 1) {
			if (!wasHit && this.settings.gameModes.includes("arpeggio")) {
				wasHit = Target.shootNotes(notes) 
			}

			if (!wasHit && this.settings.gameModes.includes("scale")) {
				wasHit = Target.shootNotes(notes)
			}
			// }

				
			// Successfull hit
			if (wasHit) {
				this.gameSounds.success.start()

				this.incrementScore();

				// Increase createTargetRate by 10% if user scored 10 points
				// Stop increasing when a rate of 100ms is reached
				if (
					this.score > 0 &&
					this.score % 10 == 0 &&
					this.currentCreateTargetRate > 100
				) {
					this.incrementLevel();
				}

			}
		


			// Subtract a Heart if mistake
			if (!wasHit && (notes.length >0 || chords.length > 0)) {
				if (this.settings.useHearts) {
					this.lowerHearts()
				}
			}
		}
		
	}
}

new Game();
