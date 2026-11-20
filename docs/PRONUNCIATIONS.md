# Word pronunciation data

Word cards use the pronunciation already saved on the entry when available. The spelling lookup checks the original lexicon and then the bundled General American pronunciation list. The lookup is read-only and the browser can cache the list for offline use. Entries with no verified pronunciation still have the pronunciation button.

The pronunciation list is generated from [ipa-dict en_US](https://github.com/open-dict-data/ipa-dict/blob/972cd67dd5f96bc5660e28070cde26e3928abcd7/data/en_US.txt). Its source SHA-256 is `2af6f154a5c363275f052d1f85acedef38ed185ca9745aa4314be77f6b70de67`. ipa-dict credits [cmudict-ipa](https://github.com/lingz/cmudict-ipa/tree/629483e9a7fa5b9ff11bb83e3fda6dcc25c5c511) and the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict/blob/74790861f652b15e4ac49015a90074ad62a27690/LICENSE). Their license notices are distributed in `public/licenses/phonetics/`. The verified FAQ entry is sourced from [Cambridge Dictionary](https://dictionary.cambridge.org/us/pronunciation/english/faq).

Rebuild the bundled asset with `node scripts/build-phonetics.mjs path/to/en_US.txt`. Bump its filename version when changing the published dictionary so cached applications can fetch the new data.
