import { Configuration, OpenAIApi } from "openai";
import axios, { AxiosRequestConfig } from "axios";
import { txt2imgBody } from "./request";
import { ConfigurationParameters } from "openai";

let openaiInstance: OpenAIApi;
let globalSymbolsURL = "https://www.globalsymbols.com/api/v1/labels/search/";
let pictonizerURL = "";

export function init({
  openAIConfiguration,
  globalSymbolsApiURL,
  pictonizerApiURL,
}: {
  openAIConfiguration: ConfigurationParameters;
  globalSymbolsApiURL?: string;
  pictonizerApiURL?: string;
}) {
  const configuration = new Configuration(openAIConfiguration);
  openaiInstance = new OpenAIApi(configuration);

  if (globalSymbolsApiURL) {
    globalSymbolsURL = globalSymbolsApiURL;
  }

  if (pictonizerApiURL) {
    pictonizerURL = pictonizerApiURL;
  }

  return {
    getSuggestions,
    pictonizer,
    getSuggestionsAndProcessPictograms,
  };
}

//New function using Azure OpenAI Cboard API
async function getWordSuggestions(
  prompt: string,
  maxWords: number,
  language: string
): Promise<string[] | { error: string }> {
  if (!prompt || !maxWords || !language) {
    console.error("Error with parameters");
    return { error: "Error with parameters" };
  }

  try {
    const completionRequestParams = {
      model: "text-davinci-003",
      prompt:
        "act as a speech pathologist selecting pictograms in language " +
        language +
        " for a non verbal person about " +
        prompt +
        " .You must provide a list of " +
        maxWords +
        ". Do not add any other text or characters to the list. Template for the list {word1, word2, word3,..., wordN}",
      max_tokens: 100,
      temperature: 0,
    };

    const response = await openaiInstance.createCompletion(
      completionRequestParams
    );

    const wordsSuggestionsData = response.data?.choices[0]?.text;
    //console.log("wordSuggestionData: " + JSON.stringify(wordsSuggestionsData));

    if (wordsSuggestionsData) {
      // Remove the "\n\n" using replace() method
      const trimmedString = wordsSuggestionsData.replace(/\n\n/g, "");
      // Extract the words inside the curly braces using regular expressions

      /* OLD CODE
        const wordsSuggestionsList = trimmedString
        .match(/{(.*?)}/)[1]
        .split(",")
        .map((word) => word.trim());
      */
      const match = trimmedString.match(/{(.*?)}/);
      const wordsSuggestionsList = match
        ? match[1].split(",").map((word) => word.trim())
        : [];

      return wordsSuggestionsList;
    } else {
      console.log("Error with the response");
      return { error: "Error with the response" };
    }
  } catch (e: Error | any) {
    console.error("Error generating word suggestions: ", e.message);
  }
  return { error: "Error generating word suggestions" };
}

type Pictogram = {
  id: string;
  text: string;
  locale: string;
  picto: string[];
};

async function fetchPictogramsURLs(
  words: string[],
  symbolSet: string,
  language: string
): Promise<Pictogram[] | { error: string }> {
  try {
    const requests = words.map((word) =>
      axios.get(globalSymbolsURL, {
        params: {
          query: word,
          symbolset: symbolSet,
          language: language,
        },
      } as AxiosRequestConfig)
    );
    const responses = await Promise.all(requests);

    const dataList = responses.map((response) =>
      response.data.length > 0
        ? response.data
        : [
            {
              id: "NaN",
              text: words[responses.indexOf(response)],
              language: language,
              picto: { image_url: "ERROR: No image in the Symbol Set" },
            },
          ]
    );

    const pictogramsList: Pictogram[] = dataList.map((data) => ({
      id: data[0].id,
      text: data[0].text,
      locale: data[0].language,
      picto: data.map((picto: any) => picto.picto.image_url),
    }));

    return pictogramsList;
  } catch (error: Error | any) {
    console.error("Error fetching pictograms URLs:", error.message);
    return { error: "Error fetching pictograms URLs" };
  }
}

async function pictonizer(inputValue: string) {
  const pictonizerURL = process.env.PICTONIZER_URL;

  // Validate environment variables and inputs
  if (!pictonizerURL) {
    console.error(
      "PICTONIZER_URL is not defined in the environment variables."
    );
    return;
  }
  if (!inputValue) {
    console.error("Input value cannot be empty.");
    return;
  }

  //TODO pedir que me de un prompt mejorado del picto a mejorar
  //https://platform.openai.com/docs/guides/prompt-engineering
  //https://learnprompting.org/es/docs/intro Imageprompting

  // Update txt2imgBody object's properties that relate to input
  txt2imgBody.prompt =
    "a pictogram of " +
    inputValue +
    ", (vectorized, drawing, simplified, rounded face, digital art, icon)";
  txt2imgBody.negative_prompt =
    "(words, letters, text, numbers, symbols), (details, open traces, sharp corners, distorted proportion), (lip, nose, tooth, rouge, wrinkles, detailed face, deformed body, extra limbs)";
  txt2imgBody.width = 512;
  txt2imgBody.height = 512;

  try {
    const response = await fetch(pictonizerURL, {
      method: "POST",
      body: JSON.stringify(txt2imgBody),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const {
      images,
      parameters: { width, height, prompt },
    } = data;

    const resultJson = {
      images: images.map((image: any) => ({
        data: image, //TODO Change this Base64 for an URL once we have deployed a function that runs this in Azure.
        width: width,
        height: height,
      })),
      prompt: prompt,
    };

    // Return the result as a JSON string
    return JSON.stringify(resultJson);
  } catch (err) {
    console.error("Error fetching data:", err);
  }
}

async function processPictograms(pictogramsURL: Pictogram[]) {
  //console.log("pictogramsURLlenght: ");
  //console.log(pictogramsURL.length);
  if (!pictogramsURL.length) {
    console.error("pictogramsURL is empty");
    return;
  }

  const updatedPictograms = await Promise.all(
    pictogramsURL.map(async (pictogram) => {
      const id = parseInt(pictogram.id);
      if (isNaN(id)) {
        return {
          ...pictogram,
          id: 123456, //TODO add library to get id nanoid
          picto: await pictonizer(pictogram.text),
        };
      }
      return pictogram;
    })
  );

  //console.log("updatedPictograms: ");
  //console.log(updatedPictograms);
  return updatedPictograms;
}

type Suggestion = {
  pictogramsURLs: Pictogram[] | { error: string };
};

async function getSuggestions(
  prompt: string,
  maxWords: number,
  symbolSet: string,
  language: string
): Promise<Suggestion> {
  const words: string[] | { error: string } = await getWordSuggestions(
    prompt,
    maxWords,
    language
  );
  const pictogramsURLs: Pictogram[] | { error: string } =
    await fetchPictogramsURLs(words as string[], symbolSet, language);

  return { pictogramsURLs };
}

//Run the whole pipeline
const getSuggestionsAndProcessPictograms = async (
  prompt: string,
  maxSuggestions: number,
  symbolSet: string,
  language: string
) => {
  try {
    const suggestions = await getSuggestions(
      prompt,
      maxSuggestions,
      symbolSet,
      language
    );
    const pictogramsURLs = suggestions.pictogramsURLs;

    if ("error" in pictogramsURLs) throw new Error(pictogramsURLs.error); //Fix this

    const pictograms = await processPictograms(pictogramsURLs);
    return pictograms;
  } catch (error) {
    //TODO return all error to the user
    console.error(error);
  }
};
