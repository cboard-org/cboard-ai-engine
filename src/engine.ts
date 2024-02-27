import { Configuration, OpenAIApi } from "openai";
import axios, { AxiosRequestConfig } from "axios";
import { txt2imgBody } from "./request";
import { ConfigurationParameters } from "openai";

let openAIInstance: OpenAIApi;
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
  openAIInstance = new OpenAIApi(configuration);

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

async function getWordSuggestions(
  prompt: string,
  maxWords: number,
  language: string
): Promise<string[]> {
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

  const response = await openAIInstance.createCompletion(
    completionRequestParams
  );

  const wordsSuggestionsData = response.data?.choices[0]?.text;

  if (wordsSuggestionsData) {
    // Remove the "\n\n" using replace() method
    const trimmedString = wordsSuggestionsData.replace(/\n\n/g, "");
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
  }
  return [];
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
): Promise<Pictogram[]> {
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
    throw new Error("Error fetching pictograms URLs " + error.message);
  }
}

async function pictonizer(imagePrompt: string): Promise<string> {
  //TODO pedir que me de un prompt mejorado del picto a mejorar
  //https://platform.openai.com/docs/guides/prompt-engineering
  //https://learnprompting.org/es/docs/intro Imageprompting

  // Update txt2imgBody object's properties that relate to input
  txt2imgBody.prompt =
    "a pictogram of " +
    imagePrompt +
    ", (vectorized, drawing, simplified, rounded face, digital art, icon)";
  txt2imgBody.negative_prompt =
    "(words, letters, text, numbers, symbols), (details, open traces, sharp corners, distorted proportion), (lip, nose, tooth, rouge, wrinkles, detailed face, deformed body, extra limbs)";
  txt2imgBody.width = 512;
  txt2imgBody.height = 512;

  try {
    if (!!pictonizerURL) {
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
      return JSON.stringify(resultJson);
    }
    throw new Error("PictonizerURL is not defined");

  } catch (error: Error | any) {
    console.error("Error generating pictogram: ", error.message);
    return JSON.stringify({
      images: [{ data: "ERROR Generating Pictogram" }],
      prompt: imagePrompt,
    });
  } 
}

async function processPictograms(pictogramsURL: Pictogram[]) {
  const updatedPictograms = await Promise.all(
    pictogramsURL.map(async (pictogram) => {
      const id = parseInt(pictogram.id);
      if (isNaN(id)) {
        return {
          ...pictogram,
          id: 123456, //TODO add library to get id nanoid
          picto: [await pictonizer(pictogram.text)],
        };
      }
      return pictogram;
    })
  );
  return updatedPictograms;
}

type Suggestion = Pictogram[];

async function getSuggestions(
  prompt: string,
  maxWords: number,
  symbolSet: string,
  language: string
): Promise<Suggestion> {
  const words: string[] = await getWordSuggestions(prompt, maxWords, language);
  const pictogramsURLs: Pictogram[] = await fetchPictogramsURLs(
    words as string[],
    symbolSet,
    language
  );

  return pictogramsURLs;
}

const getSuggestionsAndProcessPictograms = async (
  prompt: string,
  maxSuggestions: number,
  symbolSet: string,
  language: string
) => {
  const suggestions = await getSuggestions(
    prompt,
    maxSuggestions,
    symbolSet,
    language
  );
  const pictograms = await processPictograms(suggestions);
  return pictograms;
};
