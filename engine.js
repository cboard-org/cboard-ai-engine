// engine.js
//OpenAi API
const { Configuration, OpenAIApi } = require("openai");
//HTTP library
const axios = require("axios");
//dotenv
require('dotenv').config();
//Request for the Pictonizer
const { txt2imgBody } = require('./request.js'); 


// Setting Azure OpenAI API key as an environment variable
const apiKey = process.env.AZURE_OPENAI_KEY;
if (!apiKey) {
  console.error(
    "OpenAI API key is missing. Set the AZURE_OPENAI_KEY environment variable."
  );
  process.exit(1);
}

//Adding configuration to hit Azure Cboard Endpoint
const configuration = new Configuration({
  apiKey,
  basePath: 'https://cboard-openai.openai.azure.com/openai/deployments/ToEdit',
  baseOptions: {
    headers: { 'api-key': apiKey },
    params: {
      'api-version': '2022-12-01'
    }
  }
});

//Instance of Azure OpenAI with Cboard configurations
const openaiInstance = new OpenAIApi(configuration);

// Function to generate word suggestions
// Check for reference https://github.com/cboard-org/cboard-api/blob/master/api/controllers/gpt.js
// Check for reference https://platform.openai.com/docs/overview

//New function using Azure OpenAI Cboard API
async function getWordSuggestions(prompt, maxWords, language) {
  
  if (!prompt || !maxWords || !language) {
    console.error("Error with parameters");
    return { error: "Error with parameters" };
  }

  try {
    const completionRequestParams = {
      model: 'text-davinci-003',
      prompt: "act as a speech pathologist selecting pictograms in language " + language + " for a non verbal person about " + prompt + " .You must provide a list of " + maxWords + ". Do not add any other text or characters to the list. Template for the list {word1, word2, word3,..., wordN}",
      max_tokens: 100,
      temperature: 0
    };
    const response = await openaiInstance.createCompletion(completionRequestParams);

    const wordsSuggestionsData = response.data?.choices[0]?.text;
    console.log("wordSuggestionData: " + JSON.stringify(wordsSuggestionsData));
    
    if (wordsSuggestionsData) {
      // Remove the "\n\n" using replace() method
      const trimmedString = wordsSuggestionsData.replace(/\n\n/g, '');
      // Extract the words inside the curly braces using regular expressions
      const wordsSuggestionsList = trimmedString.match(/{(.*?)}/)[1].split(',').map(word => word.trim());

      return wordsSuggestionsList;
    } else {
      console.log("Error with the response");
      return { error: "Error with the response" };
    }
  } catch (e) {
    console.log("Error generating word suggestions: ");
    console.log(e);
  }
  return { error: "Error generating word suggestions" }; 
}

// Function to fetch pictograms URLs for each word
// Check for reference https://globalsymbols.com/api/docs#!/labels/getV1LabelsSearch
// Check for reference https://github.com/cboard-org/cboard/blob/c1f172a33c0f9f14ac60aba2f89896f8a6d29584/src/api/api.js#L111

async function fetchPictogramsURLs(words, symbolSet, language) {  
  const globalSymbolsUrl = process.env.GLOBALSYMBOLS_URL;
  try {
    const requests = words.map((word) =>
      axios.get(globalSymbolsUrl, {
        params: {
          query: word,
          symbolset: symbolSet,
          language: language,
        },
      })
    );
    const responses = await Promise.all(requests);


    //Create a list of data from response, handle when data is empty
    const dataList = responses.map((response) => {
      return response.data.length > 0
        ? response.data
        : [
            {
              id: "NaN",
              text: words[responses.indexOf(response)],
              language: language,  //TODO arreglame esto cat
              picto: { image_url: "ERROR: No image in the Symbol Set" },
            },
          ];
    });


    // Check the data
    //console.log("data output:");
    //console.log(dataList);

    //Create a list from data, selecting all picto elements for each data object
    const pictogramsList = dataList.map((data) => ({
      id: data[0].id,
      text: data[0].text,
      locale: data[0].language,
      picto: data.map((picto) => picto.picto.image_url),
    }));

    // Check the pictograms
    console.log("pictograms output: ");
    console.log(pictogramsList);

    return pictogramsList;

  } catch (error) {
    console.error("Error fetching pictograms URLs:", error);
    return { error: "Error fetching pictograms URLs" };
  }
}

//Function to get a Gen AI Pictogram created from a prompt, use this when GlobalSymbols return NaN
async function pictonizer(inputValue) {  
  const pictonizerURL = process.env.PICTONIZER_URL;
  
  // Validate environment variables and inputs
  if (!pictonizerURL) {
    console.error('PICTONIZER_URL is not defined in the environment variables.');
    return;
  }
  if (!inputValue) {
    console.error('Input value cannot be empty.');
    return;
  }

  //TODO pedir que me de un prompt mejorado del picto a mejorar 
  //https://platform.openai.com/docs/guides/prompt-engineering
  //https://learnprompting.org/es/docs/intro Imageprompting

  // Update txt2imgBody object's properties that relate to input
  txt2imgBody.prompt = "a pictogram of " + inputValue + ", (vectorized, drawing, simplified, rounded face, digital art, icon)";
  txt2imgBody.negative_prompt = "(words, letters, text, numbers, symbols), (details, open traces, sharp corners, distorted proportion), (lip, nose, tooth, rouge, wrinkles, detailed face, deformed body, extra limbs)"
  txt2imgBody.width = 512;
  txt2imgBody.height = 512;

  try {
    const response = await fetch(pictonizerURL, {
      method: 'POST',
      body: JSON.stringify(txt2imgBody),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    //console.log(data);
    
    // Extract the necessary information from the response
    const { images, parameters: { width, height, prompt } } = data;

    // Construct a new JSON object with the extracted data
    const resultJson = {
      images: images.map(image => ({
        data: image, //TODO Change this Base64 for an URL once we have deployed a function that runs this in Azure.
        width: width,
        height: height
      })),
      prompt: prompt,
   };

    // Return the result as a JSON string
    return JSON.stringify(resultJson);

  } catch (err) {
    console.error('Error fetching data:', err);
  }
}

//Function to process pictograms, use this when GlobalSymbols return NaN
async function processPictograms(pictogramsURL) {
  //Check the lenght of pictogramsURL
  console.log("pictogramsURLlenght: ");
  console.log(pictogramsURL.length);
  if (pictogramsURL.length === 0) {
    console.error('pictogramsURL is empty');
    return;
  }
  // Check if pictogramsURL is an array
  if (!Array.isArray(pictogramsURL)) {
    console.error('pictogramsURL is not an array');
    return;
  }
  
  const updatedPictograms = await Promise.all(
    pictogramsURL.map(async (pictogram) => {
      const id = pictogram.id;
      if (isNaN(id)) {
        return {
          ...pictogram,
          id: 123456, //TODO add library to get id nanoid
          picto: await pictonizer(pictogram.text)
        };
      }
      return pictogram;
    })
  );

  //console.log("updatedPictograms: ");
  //console.log(updatedPictograms);

  // Return the updatedPictograms
  return updatedPictograms;
}



//Function to get word suggestions and then fetch a Pictogram for each suggested word
async function getSuggestions(prompt, maxWords, symbolSet, language) {
  //const words = await getWordSuggestions(prompt, maxWords, language);
  const words = ["Pizza", "Pasta", "Gelato", "Espresso", "Mocha"];
  const pictogramsURLs = await fetchPictogramsURLs(words, symbolSet, language);
  // Return the list of words and pictograms URLs
  return { pictogramsURLs };
}


//Run the whole pipeline
const getSuggestionsAndProcessPictograms = async (prompt, maxSuggestions, symbolSet, language) => {
  try {
    const suggestions = await getSuggestions(prompt, maxSuggestions, symbolSet, language);
    const pictogramsURLs = suggestions.pictogramsURLs; 
    const pictograms = await processPictograms(pictogramsURLs);
    return pictograms;
  } catch (error) {
    //TODO return all error to the user
    console.error(error);
  }
};


// Export the functions to be used
module.exports = { 
  getSuggestions,
  pictonizer,
  getSuggestionsAndProcessPictograms, 
};




