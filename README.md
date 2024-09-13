# Cboard AI Engine

This engine powers the Cboard AI builder, designed to generate content suggestions for communication boards and create new pictograms as necessary.

With a simple prompt, it will generate a list of suggestions that can be used to create an AAC board. Each suggestion will be associated with a text description and a list of images.

The images can be retrieved from [ARASAAC](https://arasaac.org/index.html) or [Global Symbols](https://www.globalsymbols.com/), and the text descriptions are generated using the [OpenAI Node API Library](https://www.npmjs.com/package/openai).

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
  - [Initialization](#initialization)
- [Types](#types)
- [Methods](#methods)
  - [getSuggestions](#getSuggestions)
  - [isContentSafe](#isContentSafe)
- [Error Handling](#error-handling)
- [License](#license)

## Installation

```bash
npm install cboard-ai-engine
```

or

```bash
yarn add cboard-ai-engine
```

## Usage

The code below shows how to get started using the Cboard AI Engine.

```javascript
import { initEngine } from "cboard-ai-engine";

const engineInstance = initEngine({
  openAIConfiguration,
  globalSymbolsApiURL,
});

const suggestions = await engineInstance.getSuggestionsAndProcessPictograms({
  prompt: "Brazilian food",
  maxSuggestions: 5,
  language: "en", // Use two letter language code or locale (en.US for example)
  symbolSet: "arasaac"
});
```

### Initialization

```javascript
const engineInstance = initEngine({
  openAIConfiguration,
  globalSymbolsApiURL,
  pictonizerConfiguration,
  arasaacURL
});
```

The `initEngine` function is used to initialize the engine. Takes an object with the following properties as its only argument:

- `openAIConfiguration`: Object with the OpenAI configuration. Required.

```javascript
const openAIConfiguration = {
  apiKey: "your openai api key",
  basePath: "https://your-openai-base-path.com",
  baseOptions: {
    headers: { "api-key": "your openai api key" },
    params: { "api-version": "2022-12-01" },
  },
};
```

- `globalSymbolsApiURL`: The Global Symbols API URL. Default is `https://www.globalsymbols.com/api/v1/labels/search/`. Optional.

- `arasaacURL`: The ARASAAC API URL. Default is `https://api.arasaac.org/api/pictograms`. Optional.

Return:

It returns an instance of the engine with the following methods:

- `getSuggestions`: This method is used to get suggestions with images solely from Global Symbols.

- `isContenSafe`: This method is used to check if the content is safe.

## Types

The engine uses the following types:

```typescript
export type Suggestion = {
  id: string; // Unique identifier for the suggestion
  label: string; // The text description of the suggestion
  locale: string; // The language of the suggestion
  pictogram: { 
    images:
      | {
          id: string; // Indentifier for the image from Global Symbols
          symbolSet: string; // The symbol set of the image
          url: string; // The URL of the image
        }[]
  };
};
```

## Methods

### getSuggestions

```typescript
async function getSuggestions({
  prompt,
  maxSuggestions,
  symbolSet,
  language = DEFAULT_LANGUAGE,
}: {
  prompt: string;
  maxSuggestions: number;
  symbolSet?: string;
  language: string;
}): Promise<Suggestion[]>;
```

This method is used to get the suggestions with images solely from Global Symbols. It will not generate new pictograms with the Cboard Pictonizer.

Parameters:

- `prompt` : The prompt to be used to generate the suggestions. Required. Type: string.

- `maxSuggestions`: The maximum number of suggestions to be returned. Default is 10. Optional. Type: number.

- `symbolSet`: The symbol set to be used. If `undefined`, images will be searched across all Global Symbol image banks. Optional. Type: string.

- `language`: The language to be used. Default is `en`. Use two-letters code or locale Optional. Type: string.

Return:

It returns an array of Suggestion.


### isContentSafe

```typescript
async function isContentSafe({
  text,
}: {
  text: string;
}): Promise<boolean>;
```

This method is used to check if the provided text is safe for use.

Parameters:

- `text`: The text to be checked. Required. Type: string.

Return:

It returns a boolean indicating whether the content is safe.

## Error Handling

When an error occurs, an error will be thrown. It is recommended to use a try/catch block to handle it.

```javascript
try {
  const suggestions = await engineInstance.getSuggestions({
    prompt,
    maxSuggestions,
    symbolSet,
    language
  });
} catch (error) {
  console.error(error);
}
```

    NOTE: Is not needed on the initialization method.

## License

Copyright © 2024 Cboard

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License version 3 as published by the Free Software Foundation.

- Code - [GPLv3](https://github.com/cboard-org/cboard/blob/master/LICENSE.txt)
- ARASAAC Symbols - [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
