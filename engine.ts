// engine.ts
import openai from "openai";
import axios, { AxiosRequestConfig } from "axios";
import dotenv from "dotenv";
dotenv.config();

// Setting your OpenAI API key as an environment variable
const apiKey: string = process.env.OPENAI_API_KEY || "sk-AAAAAAAAAAAAAAAAAAAAAAAAAA";
if (!apiKey) {
  console.error(
    "OpenAI API key is missing. Set the OPENAI_API_KEY environment variable."
  );
  process.exit(1);
}

const openaiInstance = new openai.OpenAI({ apiKey: apiKey });

async function getWordSuggestions(prompt: string, maxWords: number, language: string): Promise<string[] | { error: string }> {
  try {
    const completion = await openaiInstance.chat.completions.create({
      messages: [
        {
          role: "user",
          content:
            "act as a speech pathologist selecting pictograms in language " +
            language +
            " for a non verbal person about " +
            prompt +
            " .Only provide a list of words and a maximum of " +
            maxWords +
            " words. Do not add any other text or characters besides the list of words.",
        },
      ],
      model: "gpt-3.5-turbo",
      temperature: 0.0,
      max_tokens: 100,
    });

    const response: string = completion.choices[0].message.content;
    const itemList: string[] = response.split("\n");
    const words: string[] = itemList.map((item: string) => item.replace(/^\d+\.\s/, ""));

    return words;
  } catch (error) {
    console.error("Error generating word suggestions:", error);
    return { error: "Error generating word suggestions" };
  }
}

interface Pictogram {
  id: string;
  text: string;
  locale: string;
  picto: string[];
}

async function fetchPictogramsURLs(words: string[], symbolSet: string, language: string): Promise<Pictogram[] | { error: string }> {
  const globalSymbolsUrl: string =
    "https://www.globalsymbols.com/api/v1/labels/search?";
  try {
    const requests = words.map((word) =>
      axios.get(globalSymbolsUrl, {
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
              locale: language,
              picto: { image_url: "ERROR: No image in the Symbol Set" },
            },
          ]
    );

    const pictogramsList: Pictogram[] = dataList.map((data) => ({
      id: data[0].id,
      text: data[0].text,
      locale: data[0].language,
      picto: data.map((picto) => picto.picto.image_url),
    }));

    return pictogramsList;
  } catch (error) {
    console.error("Error fetching pictograms URLs:", error);
    return { error: "Error fetching pictograms URLs" };
  }
}

interface Suggestion {
  pictogramsURLs: Pictogram[] | { error: string };
}

async function getSuggestions(prompt: string, maxWords: number, symbolSet: string, language: string): Promise<Suggestion> {
  const words: string[] | { error: string } = await getWordSuggestions(prompt, maxWords, language);
  const pictogramsURLs: Pictogram[] | { error: string } = await fetchPictogramsURLs(words as string[], symbolSet, language);

  return { pictogramsURLs };
}

export { getSuggestions };