type BestSearchResponse = {
  _id: number;
  keywords: BestSearchKeywords;
  schematic: boolean;
  sex: boolean;
  violence: boolean;
  created: Date;
  lastUpdated: Date;
  downloads: number;
  categories: string[];
  synsets: string[];
  tags: string[];
  desc: string;
};

type BestSearchKeywords = [
  {
    idKeyword: number;
    keyword: string;
    plural: string;
    idLocution: string;
    meaning: string;
    type: number;
    lse: number;
  }
];

export type BestSearchApiResponse = BestSearchResponse[];
