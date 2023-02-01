import { Midi } from '@tonaljs/tonal';
import * as Tone from 'tone';

import { SampleLibrary } from '@stellarogs/tonejs-instruments'
// import { SampleLibrary } from '../static/tonejs-instruments/Tonejs-Instruments';

export default class Piano {
	constructor() {
		this.display = document.querySelector('.piano');

		// play sounds immediatley (remove delay)
		Tone.context.lookAhead = 0
		
		// default synth sound
		const reverb = new Tone.Reverb().toDestination();
		const filter = new Tone.Filter(500, 'highpass').toDestination();
		this.synth = new Tone.PolySynth().connect(filter).connect(reverb);

		// load tonejs-instruments sounds
		const instruments = ['piano', 'bass-electric', 'bassoon', 'cello', 'clarinet', 'contrabass', 'flute', 'french-horn', 'guitar-acoustic', 'guitar-electric', 'harmonium',  'organ', 'saxophone', 'trombone', 'trumpet', 'tuba', 'violin', 'xylophone', 'harp', 'guitar-nylon',]
        
        const samples = SampleLibrary.load({
            instruments: instruments,
			baseUrl: "http://localhost:1234/static/tonejs-instruments/samples/",
			onload: () => {
				console.log('loaded sounds!'); 
			}
        })
		
		this.instruments = instruments
		this.samples = samples
		this.newCurrentInstrument()

		// play on note hit
		this.playSound = false

		// random seed
		this.seed = Math.random()
	}

	newCurrentInstrument() {
		this.seed = Math.random()

		// select as many insturments -> summed into one sound
		this.instrumentCurrent = []

		const numInstr = 13
		for (let i=0; i< numInstr; i++) {
			this.instrumentCurrent.push(this.getRandomInstrument())
		}
	}

	start() {
		
		Tone.start();
		Tone.context.lookAhead = 0
		// const sampler = new Tone.Sampler({
		// 	urls: {
		// 		A1: "A1.mp3",
		// 	},
		// 	baseUrl: "https://tonejs.github.io/audio/casio/",
		// 	onload: () => {
		// 		sampler.triggerAttackRelease(["C1", "E1", "G1", "B1"], 0.5);
		// 	}
		// }).toDestination();

	}

	getRandomInstrument() {
		// returns random instrument from loaded instrument samples
		const randIdx = Math.floor(Math.random()*this.instruments.length)
		return this.samples[this.instruments[randIdx]].toDestination();
	}

	noteOn(note) {
		const noteName = Midi.midiToNoteName(note, {
			sharps: true,
		});
		const noteClass = Midi.midiToNoteName(note, {
			pitchClass: true,
			sharps: true,
		});

		// play through instrument
		Tone.Buffer.loaded().then(() => {
			if (this.playSound) {
				// each instrument will be set to a volume (this is seeded at init) note: this makes for a new unique insturment each time
				var seededRandom = new Math.seedrandom(this.seed);
				const velocity = seededRandom()
				this.instrumentCurrent.map(i => i.triggerAttack(noteName, Tone.now(), velocity))
			}
		})
		
			//this.synth.triggerAttack(noteName, Tone.now());
		

		this.display
			.querySelector(`[data-note="${noteClass}"]`)
			.classList.add('pressed');
	}

	noteOff(note) {
		const noteName = Midi.midiToNoteName(note, {
			sharps: true,
		});
		const noteClass = Midi.midiToNoteName(note, {
			pitchClass: true,
			sharps: true,
		});

		// stop all sounds
		for (let i=0; i<this.instruments.length; i++) {
			const inst = this.instruments[i]
			
			if (this.playSound) {
				this.samples[inst].triggerRelease(noteName, Tone.now());
			}
		}
			// this.synth.triggerRelease(noteName, Tone.now());

		this.display
			.querySelector(`[data-note="${noteClass}"]`)
			.classList.remove('pressed');
	}
}
