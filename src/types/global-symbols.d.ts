type LabelSearchResponse = {
  id: number;
  text: string;
  text_diacritised: string;
  description: string;
  language: string;
  picto: Pictogram;
};

type Pictogram = {
  id: number;
  symbolset_id: number;
  part_of_speech: string;
  image_url: string;
  native_format: string;
  adaptable: string;
  symbolset: GlobalSymbolsSymbolSet;
};

type GlobalSymbolsSymbolSet = {
  id: number;
  slug: string;
  name: string;
  publisher: string;
  publisher_url: string;
  status: string;
  licence: Licence;
  featured_level: number;
};

type Licence = {
  name: string;
  url: string;
  version: string;
  properties: string;
};

export type LabelsSearchApiResponse = LabelSearchResponse[];
