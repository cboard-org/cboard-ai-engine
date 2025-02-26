import { OpenAIApi } from "openai";
import { getLanguageName, getLanguageTwoLetterCode } from "./language";
import { CategoryName } from "../types/coreboard-types";

export class OpenAIService {
  constructor(private openAIInstance: OpenAIApi) {}

  /**
   * Generates word suggestions based on a prompt
   * @param prompt The topic or context for word generation
   * @param maxWords Maximum number of words to generate
   * @param language Language code for the word generation
   * @returns Array of suggested words
   */
  async getWordSuggestions({
    prompt,
    maxWords,
    language,
  }: {
    prompt: string;
    maxWords: number;
    language: string;
  }): Promise<string[]> {
    const languageName = getLanguageName(language);
    const max_tokens = Math.round(4.5 * maxWords + 200);

    try {
      const response = await this.openAIInstance.createChatCompletion({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `act as a speech pathologist selecting pictograms in language ${languageName} 
            for a non verbal person about what the user asks you to.
            Here are mandatory instructions for the list:
             -Ensure that the list contains precisely ${maxWords} words; it must not be shorter or longer.
             -The words should be related to the topic.
             -When using verbs, you must use the infinitive form. Do not use gerunds, conjugated forms, or any other variations of the verb. 
             -Do not repeat any words.
             -Do not include any additional text, symbols, or characters beyond the words requested.
             -The list should follow this exact format: {word1, word2, word3,..., wordN}.`,
          },
          {
            role: "user",
            content: `Create a board about ${prompt}`,
          },
        ],
        temperature: 0,
        max_tokens: max_tokens,
      });

      const wordsSuggestionsData = response.data?.choices[0]?.message?.content;
      if (wordsSuggestionsData) {
        const trimmedString = wordsSuggestionsData.replace(/\n\n/g, "");
        const match = trimmedString.match(/{(.*?)}/);
        const wordsSuggestionsList = match
          ? match[1]
              .split(",")
              .map((word) => word.trim())
              .slice(0, maxWords)
          : [];

        if (!wordsSuggestionsList.length) {
          throw new Error(
            "ERROR: Suggestion list is empty or maxToken reached"
          );
        }

        return wordsSuggestionsList;
      }

      throw new Error("ERROR: Suggestion list is empty");
    } catch (error) {
      console.error("Error getting word suggestions:", error);
      throw error;
    }
  }

  /**
   * Generates core vocabulary words by category
   * @param prompt The topic or context for word generation
   * @param categorySlots Array of category configurations with slots
   * @returns Map of category names to arrays of words
   */
  async generateDynamicWords(
    prompt: string,
    categorySlots: { name: CategoryName; slots: number; required: boolean }[]
  ): Promise<Map<CategoryName, string[]>> {
    const dynamicCategories = categorySlots.filter(
      (cat) => !this.hasFixedWords(cat.name)
    );
    const wordsMap = new Map<CategoryName, string[]>();
    const max_tokens = Math.round(4.5 * 50 + 200);

    for (const category of dynamicCategories) {
      try {
        const response = await this.openAIInstance.createChatCompletion({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a speech language pathologist selecting core vocabulary ${category.name.toLowerCase()} related to "${prompt}". Provide exactly ${
                category.slots
              } common, versatile words that could be used across multiple contexts.`,
            },
            {
              role: "user",
              content: `Generate ${
                category.slots
              } core ${category.name.toLowerCase()} for the topic "${prompt}". Return only the words in a comma-separated list.`,
            },
          ],
          temperature: 0,
          max_tokens: max_tokens,
        });

        const content = response.data.choices[0]?.message?.content;
        if (!content) {
          throw new Error("Failed to get valid response from LLM");
        }

        const wordList = content
          .split(",")
          .map((word) => word.trim())
          .slice(0, category.slots);

        wordsMap.set(category.name, wordList);
      } catch (error) {
        console.error(
          `Error generating dynamic words for ${category.name}:`,
          error
        );
        throw error;
      }
    }

    return wordsMap;
  }

  // Helper method to check if a category has fixed words
  private hasFixedWords(category: CategoryName): boolean {
    const fixedCategories: CategoryName[] = [
      "Pronouns",
      "Questions",
      "Interjections",
      "Negation",
    ];
    return fixedCategories.includes(category);
  }
}
