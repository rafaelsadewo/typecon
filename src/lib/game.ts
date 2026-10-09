const EZ = 'api air batu kayu laut bulan bintang angin hujan salju singa macan burung ikan kucing anjing nasi roti susu kopi buku meja kursi pintu jalan rumah tangan kaki mata hati cinta menang kalah main lari lompat cepat kuat besar kecil panas dingin merah biru emas besi langit tanah awan kuda sapi ayam bebek'.split(' ')
const HD = 'petarung pahlawan pedang bayangan istana ksatria penyihir gunung samudra petualangan keberanian kemenangan pertempuran kecepatan semangat persahabatan perjalanan matahari pelangi belantara kerajaan pendekar harimau rajawali jagoan pemberani kesatria perkasa tangguh juara'.split(' ')

export const makeText = (n: number, hard: number) =>
  Array.from({ length: n }, () => { const l = Math.random() < hard ? HD : EZ; return l[Math.random() * l.length | 0] }).join(' ')

const COLORS = ['#ff8a6e', '#ffa86e', '#ffe16e', '#8fff6e', '#6effc8', '#6edcff', '#a06eff', '#ff6ee0', '#ff4d4d', '#ffffff']
export const LV = (['Slime', 'Goblin', 'Orc', 'Troll', 'Ninja', 'Wizard', 'Vampire', 'Zombie King', 'Dragon', 'KING TYPO'] as const)
  .map((name, i) => ({ name, color: COLORS[i], wpm: 15 + 7 * i, hard: i / 9, words: 20 + 2 * i })) // bot wpm 15..78

/** chars in completed words (a word counts once its trailing space / the end is typed) */
export const done = (text: string, pos: number) => pos >= text.length ? text.length : text.lastIndexOf(' ', pos - 1) + 1
