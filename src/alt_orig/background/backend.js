import { assertNonNull, truncate } from '../util.js';
import { config } from './background.js';
const API_RATELIMIT = 0.2; // seconds between requests
const SCRAPE_RATELIMIT = 1.1; // seconds between requests
// NOTE: If you change these, make sure to change the .map calls down below in the parse function too
const TOKEN_FIELDS = ['vocabulary_index', 'position', 'length', 'furigana'];
const VOCAB_FIELDS = [
    'vid',
    'sid',
    'rid',
    'spelling',
    'reading',
    'frequency_rank',
    'part_of_speech',
    'meanings_chunks',
    'meanings_part_of_speech',
    'card_state',
    'pitch_accent',
];
export async function parse(text) {
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiToken}`,
            Accept: 'application/json',
        },
        body: JSON.stringify({
            text,
            // furigana: [[position, length reading], ...] // TODO pass furigana to parse endpoint
            position_length_encoding: 'utf16',
            token_fields: TOKEN_FIELDS,
            vocabulary_fields: VOCAB_FIELDS,
        }),
    };
    const response = await fetch('https://jpdb.io/api/v1/parse', options);
    if (!(200 <= response.status && response.status <= 299)) {
        const data = (await response.json());
        throw Error(`${data.error_message} while parsing 「${truncate(text.join(' '), 20)}」`);
    }
    const data = (await response.json());
    const cards = data.vocabulary.map(vocab => {
        // NOTE: If you change these, make sure to change VOCAB_FIELDS too
        const [vid, sid, rid, spelling, reading, frequencyRank, partOfSpeech, meaningsChunks, meaningsPartOfSpeech, cardState, pitchAccent,] = vocab;
        return {
            vid,
            sid,
            rid,
            spelling,
            reading,
            frequencyRank,
            partOfSpeech,
            meanings: meaningsChunks.map((glosses, i) => ({ glosses, partOfSpeech: meaningsPartOfSpeech[i] })),
            state: cardState ?? ['not-in-deck'],
            pitchAccent: pitchAccent ?? [], // HACK not documented... in case it can be null, better safe than sorry
        };
    });
    const tokens = data.tokens.map(tokens => tokens.map(token => {
        // This is type-safe, but not... variable name safe :/
        // NOTE: If you change these, make sure to change TOKEN_FIELDS too
        const [vocabularyIndex, position, length, furigana] = token;
        const card = cards[vocabularyIndex];
        let offset = position;
        const rubies = furigana === null
            ? []
            : furigana.flatMap(part => {
                if (typeof part === 'string') {
                    offset += part.length;
                    return [];
                }
                else {
                    const [base, ruby] = part;
                    const start = offset;
                    const length = base.length;
                    const end = (offset = start + length);
                    return { text: ruby, start, end, length };
                }
            });
        return {
            card,
            start: position,
            end: position + length,
            length: length,
            rubies,
        };
    }));
    return [[tokens, cards], API_RATELIMIT];
}
export function addToDeck(vid, sid, deckId) {
    if (deckId === 'forq') {
        return addToForqScrape(vid, sid);
    }
    else {
        return addToDeckAPI(vid, sid, deckId);
    }
}
async function addToDeckAPI(vid, sid, deckId) {
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiToken}`,
            Accept: 'application/json',
        },
        body: JSON.stringify({
            id: deckId,
            vocabulary: [[vid, sid]],
        }),
    };
    const response = await fetch('https://jpdb.io/api/v1/deck/add-vocabulary', options);
    if (!(200 <= response.status && response.status <= 299)) {
        const data = (await response.json());
        throw Error(`${data.error_message} while adding word ${vid}/${sid} to deck "${deckId}"`);
    }
    return [null, API_RATELIMIT];
}
async function addToForqScrape(vid, sid) {
    const response = await fetch('https://jpdb.io/prioritize', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/110.0',
            Accept: '*/*',
            'content-type': 'application/x-www-form-urlencoded',
        },
        body: `v=${vid}&s=${sid}&origin=/`,
    });
    if (response.status >= 400) {
        throw Error(`HTTP error ${response.statusText} while adding word ${vid}/${sid} to FORQ`);
    }
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (doc.querySelector('a[href="/login"]') !== null)
        throw Error(`You are not logged in to jpdb.io - Adding cards to the FORQ requires being logged in`);
    return [null, SCRAPE_RATELIMIT];
}
export function removeFromDeck(vid, sid, deckId) {
    if (deckId === 'forq') {
        return removeFromForqScrape(vid, sid);
    }
    else {
        return removeFromDeckAPI(vid, sid, deckId);
    }
}
async function removeFromDeckAPI(vid, sid, deckId) {
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiToken}`,
            Accept: 'application/json',
        },
        body: JSON.stringify({
            id: deckId,
            vocabulary: [[vid, sid]],
        }),
    };
    const response = await fetch('https://jpdb.io/api/v1/deck/remove-vocabulary', options);
    if (!(200 <= response.status && response.status <= 299)) {
        const data = (await response.json());
        throw Error(`${data.error_message} while removing word ${vid}/${sid} from deck "${deckId}"`);
    }
    return [null, API_RATELIMIT];
}
async function removeFromForqScrape(vid, sid) {
    const response = await fetch('https://jpdb.io/deprioritize', {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: '*/*',
            'content-type': 'application/x-www-form-urlencoded',
        },
        body: `v=${vid}&s=${sid}&origin=`,
    });
    if (response.status >= 400) {
        throw Error(`HTTP error ${response.statusText} while removing word ${vid}/${sid} from FORQ`);
    }
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (doc.querySelector('a[href="/login"]') !== null)
        throw Error(`You are not logged in to jpdb.io - Removing cards from the FORQ requires being logged in`);
    return [null, SCRAPE_RATELIMIT];
}
export async function setSentence(vid, sid, sentence, translation) {
    const body = { vid, sid };
    if (sentence)
        body.sentence = sentence;
    if (translation)
        body.translation = translation;
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiToken}`,
            Accept: 'application/json',
        },
        body: JSON.stringify(body),
    };
    const response = await fetch('https://jpdb.io/api/v1/set-card-sentence', options);
    if (!(200 <= response.status && response.status <= 299)) {
        const data = (await response.json());
        throw Error(`${data.error_message} while setting sentence for word ${vid}/${sid} to ${sentence === undefined ? 'none' : `「${truncate(sentence, 10)}」`} (translation: ${translation === undefined ? 'none' : `'${truncate(translation, 20)}'`})`);
    }
    return [null, API_RATELIMIT];
}
const REVIEW_GRADES = {
    nothing: '1',
    something: '2',
    hard: '3',
    good: '4',
    easy: '5',
    pass: 'p',
    fail: 'f',
    known: 'k',
    unknown: 'n',
    never_forget: 'w',
    blacklist: '-1',
};
export async function review(vid, sid, rating) {
    // Get current review number
    const response = await fetch(`https://jpdb.io/review?c=vf%2C${vid}%2C${sid}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: '*/*',
        },
    });
    if (response.status >= 400) {
        throw Error(`HTTP error ${response.statusText} while getting next review number for word ${vid}/${sid}`);
    }
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (doc.querySelector('a[href="/login"]') !== null)
        throw Error(`You are not logged in to jpdb.io - Reviewing cards requires being logged in`);
    const reviewNoInput = doc.querySelector('form[action^="/review"] input[type=hidden][name=r]');
    assertNonNull(reviewNoInput);
    const reviewNo = parseInt(reviewNoInput.value);
    const reviewResponse = await fetch('https://jpdb.io/review', {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: '*/*',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `c=vf%2C${vid}%2C${sid}&r=${reviewNo}&g=${REVIEW_GRADES[rating]}`, // &force=true
    });
    if (reviewResponse.status >= 400) {
        throw Error(`HTTP error ${response.statusText} while adding ${rating} review to word ${vid}/${sid}`);
    }
    return [null, 2 * SCRAPE_RATELIMIT];
}
export async function getCardState(vid, sid) {
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiToken}`,
            Accept: 'application/json',
        },
        body: JSON.stringify({
            list: [[vid, sid]],
            fields: ['card_state'],
        }),
    };
    const response = await fetch('https://jpdb.io/api/v1/lookup-vocabulary', options);
    if (!(200 <= response.status && response.status <= 299)) {
        const data = (await response.json());
        throw Error(`${data.error_message} while getting state for word ${vid}/${sid}`);
    }
    const data = (await response.json());
    const vocabInfo = data.vocabulary_info[0];
    if (vocabInfo === null)
        throw Error(`Can't get state for word ${vid}/${sid}, word does not exist`);
    return [vocabInfo[0] ?? ['not-in-deck'], API_RATELIMIT];
}
