// ── AT API Response Envelope ──

export interface ATResponse<T = unknown> {
  RequestUserAlias: string;
  RequestPath: string;
  RequestStatus: "Succeeded" | "Failed";
  ResponseCode: number;
  ResponseMessage: string;
  Payload?: T;
}

// ── Pagination ──

export interface PaginationParams {
  pageSize?: number;
  pageNumber?: number;
}

// ── Market Data Types ──

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

// ── Location Types ──

export interface LocationMetrics {
  locationAlias: string;
  [key: string]: unknown;
}

export interface MetricHistoryParams {
  locationAlias: string;
  metricList: string;
  interval: "day" | "week" | "month" | "year";
  dateRangeStart: string; // YYYY-MM-DD
  dateRangeEnd: string;
}

export interface ComparableTradesParams {
  locationAlias: string;
  dateTime: string; // YYYY-MM-DD HH:MM:SS
  inventoryTypeID: number;
}

export interface ComparableTrade {
  priceAmountInSmallestUnit: number;
  priceFactor?: number;
  isExactInventoryTypeComparable?: boolean;
  [key: string]: unknown;
}

export interface InventoryType {
  inventoryTypeID: number;
  inventoryTypeName: string;
  [key: string]: unknown;
}

export interface InventoryForecastParams {
  locationAlias: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  additionalLocationAliasSourceList?: string;
  maximumPrice?: number;
  desiredProfitBasisPoints?: number;
  pageSize?: number;
  pageNumber?: number;
}

// ── Listing Types ──

export interface Listing {
  listingID: string;
  locationAlias: string;
  dateTime: string;
  priceAmountInSmallestUnit: number;
  inventoryTypeID: number;
  status?: string;
  popularityScoreBracket?: number;
  [key: string]: unknown;
}

export interface CompetingListing {
  listingID: string;
  priceAmountInSmallestUnit: number;
  dateTime: string;
  [key: string]: unknown;
}

export interface CreateListingParams {
  locationAlias: string;
  inventoryTypeID: number;
  priceAmountInSmallestUnit: number;
  currencyCode: string;
  dateTime: string; // YYYY-MM-DD HH:MM:SS
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber: string;
  locationCategoryFieldIDValueList: Array<{
    fieldID: string;
    fieldValue: string;
  }>;
  isWritingRequest?: boolean;
}

export interface SetPriceParams {
  listingID: string;
  priceAmountInSmallestUnit: number;
  isWritingRequest?: boolean;
}

// ── Bid Types ──

export interface Bid {
  bidID: number;
  locationAlias: string;
  bidAmount: number;
  dateTimeRangeStart: string;
  dateTimeRangeEnd: string;
  inventoryTypeID: number;
  creatorUserAlias?: string;
  [key: string]: unknown;
}

export interface PlaceBidParams {
  fundingAccountID: number;
  returnToAccountID: number;
  bidAmount: number;
  sendPublishingMessages: boolean;
  isPremium: boolean;
  locationAlias: string;
  orderListID: string;
  inventoryTypeID: number;
  numberTimeRangeUnits: number;
  dateTimeRangeStart: string;
  dateTimeRangeEnd: string;
  isWritingRequest?: boolean;
}

// ── Portfolio Types ──

export interface PortfolioListingsParams {
  getPopularityScoreBracket?: boolean;
  dateTimeRangeStart?: string;
  dateTimeRangeEnd?: string;
}

// ── Account Types ──

export interface Account {
  accountID: number;
  accountName?: string;
  balance?: number;
  creditLimit?: number;
  [key: string]: unknown;
}

// ── Parsed Email Reservation ──

export interface ParsedReservation {
  restaurantName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  partySize: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  confirmationNumber?: string;
  specialNotes?: string;
  rawSource: string;
}
