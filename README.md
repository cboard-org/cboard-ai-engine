# Cboard AI Engine

This engine powers the Cboard AI builder, designed to generate content suggestions for communication boards and create new pictograms as necessary.

With a simple prompt, it will generate a list of pictograms that can be used to create an AAC board. Each pictogram will be associated with a text description and a image.

The images are retrieved from the [Global Symbols](https://www.globalsymbols.com/) website, and the text descriptions are generated using the [OpenAI Node API Library](https://www.npmjs.com/package/openai). If the image is not found, the engine will create a new pictogram using the Cboard Pictonizer.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
  - [Initialization](#initialization)
- [Methods](#methods)
  - [getSuggestionsAndProcessPictograms](#getSuggestionsAndProcessPictograms)
  - [getSuggestions](#getSuggestions)
  - [pictonizer](#pictonizer)
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
  pictonizerApiURL,
});

const suggestions = await engineInstance.getSuggestionsAndProcessPictograms({
  prompt: "Brazilian food",
  maxSuggestions: 5,
  symbolSet: "arasaac",
  language: "eng",
});
```

### Initialization

```javascript
const engineInstance = initEngine({
  openAIConfiguration,
  globalSymbolsApiURL,
  pictonizerApiURL,
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

- `pictonizerApiURL`: The Cboard Pictonizer API URL. Optional.

Return:

It returns an instance of the engine with the following methods:

- `getSuggestionsAndProcessPictograms`: This method is used to get the suggestions and process the pictograms. It returns a list of items that can be used to create an AAC board. Each item is associated with a text description and a pictogram.

- `getSuggestions`: This method is used to get the words suggestions.

- `pictonizer`: This method is used to generate a new pictogram using the Cboard Pictonizer.

## Methods

### getSuggestionsAndProcessPictograms

```typescript
async function getSuggestionsAndProcessPictograms({
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

This method is used to get the suggestions and process the pictograms. It returns a list of items that can be used to create an AAC board. Each item is associated with a text description and a pictogram.

Parameters:

- `prompt` : The prompt to be used to generate the suggestions. Required. Type: string.

- `maxSuggestions`: The maximum number of suggestions to be returned. Default is 10. Optional. Type: number.

- `symbolSet`: The symbol set to be used. If `undefined`, images will be searched across all Global Symbol image banks. Optional. Type: string.

- `language`: The language to be used. Default is `eng`. Optional. Type: string.

Return:

It returns an array of Suggestion with the following properties:

```typescript
    type Suggestion = {
      id: string;
      text: string;
      locale: string;
      picto: string[];
    }
```

Where:

- `id`: The pictogram id. Type: number.

- `picto`: The pictogram URL. Type: string[].

- `text`: The text description. Type: string.

- `locale`: The language. Type: string.

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

This method is used to get the words suggestions.

Parameters:

- `prompt` : The prompt to be used to generate the suggestions. Required. Type: string.

- `maxSuggestions`: The maximum number of suggestions to be returned. Default is 10. Optional. Type: number.

- `symbolSet`: The symbol set to be used. If `undefined`, images will be searched across all Global Symbol image banks. Optional. Type: string.

- `language`: The language to be used. Default is `eng`. Optional. Type: string.

Return:

It returns an array of Pictograms.

### pictonizer

```javascript
    const pictogram = await engineInstance.pictonizer(imagePrompt: string, language: string) => Promise<string>;
```

This method is used to generate a new pictogram using the Cboard Pictonizer.

Parameters:

- `imagePrompt` : The prompt to be used to generate the pictogram. Required. Type: string.

- `language`: The language to be used. Default is `eng`. Optional. Type: string.

Return:

NOTE: This needs to be fixed, needs to be an array of strings that contains just the URL of the pictogram.

It returns an stringified object with the following properties:

```javascript
    {
        images: images.map((image: any) => ({
          data: image,
          width: width,
          height: height,
        })),
        prompt: prompt,
    };
```

If no URL is passed on the `pictonizerApiURL` parameter, it will return:

```javascript
    {
        images: [{ data: "ERROR Generating Pictogram" }],
        prompt: imagePrompt,
    };
```

And no error will be thrown.

## Error Handling

When an error occurs, an error will be thrown. It is recommended to use a try/catch block to handle it.

```javascript
try {
  const suggestions = await engineInstance.getSuggestionsAndProcessPictograms(
    prompt,
    maxSuggestions,
    symbolSet,
    language
  );
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
