const SHIFTS_OF_A_WORD = 5
const ADDRESS_BITS_PER_WORD = 6

export class BitSet {
  //_words property is an array of 32bits integers, javascript doesn't really have integers separated from Number type
  //it's less performant because of that, number (by default float) would be internally converted to 32bits integer then accepts the bit operations
  //checked Buffer type, but needs to handle expansion/downsize by application, compromised to use number array for now.
  private readonly words: Array<number>

  constructor(nbits: number) {
    this.words = new Array(wordIndex(nbits - 1) + 1)
  }

  clear(bitIndex: number) {
    const which = whichWord(bitIndex)
    return this.words[which] = this.words[which] & ~mask(bitIndex)
  }

  set(bitIndex: number) {
    if (bitIndex < 0) {
      throw new Error(`bitIndex < 0: ${bitIndex}`)
    }

    const which = whichWord(bitIndex)
    return this.words[which] = this.words[which] | mask(bitIndex)
  }

  get(bitIndex: number): boolean {
    const wordIndex = whichWord(bitIndex)
    return wordIndex < this.words.length && (this.words[wordIndex] & mask(bitIndex)) !== 0
  }

  cardinality() {
    let next
    let sum = 0
    const arrOfWords = this.words
    const maxWords = this.words.length
    for (next = 0; next < maxWords; next += 1) {
      const nextWord = arrOfWords[next] || 0
      //this loops only the number of set bits, not 32 constant all the time!
      for (let bits = nextWord; bits !== 0; bits &= (bits - 1)) {
        sum += 1
      }
    }
    return sum
  }
}

function wordIndex(bitIndex: number) {
  return bitIndex >> ADDRESS_BITS_PER_WORD
}

/**
 * @return {Number} the index at the words array
 */
function whichWord(bitIndex: number) {
  return bitIndex >> SHIFTS_OF_A_WORD
}

/**
 * @return {Number} a bit mask of 32 bits, 1 bit set at pos % 32, the rest being 0
 */
function mask(bitIndex: number) {
  return 1 << (bitIndex & 31)
}
