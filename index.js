//const { getWordSuggestions } = require('cboard-ai-engine');
const { pictonizer } = require('./engine');
const { getSuggestionsAndProcessPictograms } = require('./engine');
const { getSuggestions } = require('./engine');
const { processPictograms } = require('./engine');

const language = 'eng';
const maxSuggestions = 12;
const symbolSet = 'arasaac';
const prompt = 'tools to cook';
const promptImage = 'orange';

/*
getSuggestions(prompt,maxSuggestions,symbolSet,language)
  .then(suggestions => console.log(suggestions))
  .then(result => console.log(result))
  .catch(error => console.error(error));

/*
pictonizer(promptImage)
  .then(picto => console.log(picto))
  .then(result => console.log(result))
  .catch(error => console.error(error));  
*/
/*
const pictogramsURL = [
  { id: 110032, text: 'pizza', locale: 'eng', picto: [Array] },
  { id: 145955, text: 'pasta', locale: 'eng', picto: [Array] },
  { id: 'NaN', text: 'Gelato', locale: undefined, picto: [Array] },
  { id: 103431, text: 'espresso', locale: 'eng', picto: [Array] },
  { id: 'NaN', text: 'beer', locale: 'eng', picto: [Array] }
];

processPictograms(pictogramsURL)
.then(picto => console.log(picto))
.then(result => console.log(result))
.catch(error => console.error(error));
*/


//Call getSuggestionsAndProcessPictograms to run the whole pipeline
getSuggestionsAndProcessPictograms(prompt,maxSuggestions,symbolSet,language)
.then(picto => console.log(picto)) 
.then(result => console.log(result))
.catch(error => console.error(error));



