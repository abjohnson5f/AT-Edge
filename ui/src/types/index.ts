export interface ATResponse<T = unknown> {
  RequestUserAlias: string;
  RequestPath: string;
  RequestStatus: "Succeeded" | "Failed";
  ResponseCode: number;
  ResponseMessage: string;
  Payload?: T;
}

export interface PaginationParams {
  pageSize?: number;
  pageNumber?: number;
}

export interface LocationRanking {
  locationAlias: string;
  locationName?: string;
  city?: string;
  score?: number;
  bidCount?: number;
  listingCount?: number;
  viewCount?: number;
  conversionRate?: number;
  [key: string]: unknown;
}

export interface Listing {
  listingID: string;
  locationAlias: string;
  locationName?: string;
  dateTime: string;
  priceAmountInSmallestUnit: number;
  inventoryTypeID: number;
  inventoryTypeName?: string;
  status?: string;
  popularityScoreBracket?: number;
  marketVisibility?: boolean;
  [key: string]: unknown;
}

export interface CompetingListing {
  listingID: string;
  priceAmountInSmallestUnit: number;
  dateTime: string;
  [key: string]: unknown;
}

export interface Bid {
  bidID: number;
  locationAlias: string;
  locationName?: string;
  bidAmount: number;
  dateTimeRangeStart: string;
  dateTimeRangeEnd: string;
  inventoryTypeID: number;
  creatorUserAlias?: string;
  [key: string]: unknown;
}

export interface Account {
  accountID: number;
  accountName?: string;
  accountNameAndBalance?: string;
  balance?: number;
  creditLimit?: number;
  currency?: string;
  [key: string]: unknown;
}

export interface ParsedReservation {
  restaurantName: string;
  date: string;          // YYYY-MM-DD
  time: string;          // HH:MM
  partySize: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  confirmationNumber?: string;
  specialNotes?: string;
}

export interface ImportResult {
  emailId: string;
  subject: string;
  parsed: ParsedReservation;
  locationMatch: { alias: string; name: string } | null;
  pricingAdvice: string;
  recommendedPriceCents: number;
  priceRangeMinCents: number;
  priceRangeMaxCents: number;
  listingResult: unknown;
  status: "created" | "dry_run" | "no_match" | "error";
  error?: string;
}

export interface ScoutReport {
  report: string; // Markdown content from Claude
  rawData: {
    highestConverting: LocationRanking[];
    mostBidsLeastAsks: LocationRanking[];
    underserved: LocationRanking[];
    mostViewedLeastListings: LocationRanking[];
    toplist: LocationRanking[];
  };
  generatedAt: string;
}

export interface PortfolioReview {
  report: string; // Markdown content from Claude
  listings: Listing[];
  generatedAt: string;
}
