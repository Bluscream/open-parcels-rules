export type PackageStatus =
	| "ordered"
	| "sent"
	| "arriving"
	| "delivered"
	| "exception"
	| "unknown";

export interface MailPackageResult {
	courier: string;
	trackingNumbers: string[];
	status: PackageStatus;
	orderNumbers?: string[];
	amazonHubCode?: string;
	deliveryDate?: Date;
}

export interface EmailData {
  from: string;
  subject: string;
  bodyPlain: string;
  bodyHtml?: string;
}

export interface ParserHelpers {
  extractTrackingNumbers: (text: string, patterns: string[]) => string[];
  extractRegex: (text: string, pattern: string, groupIndex?: number) => string | undefined;
  monthsMap: Record<string, number>;
}

export interface MatchRule {
  email?: string[];
  subject?: string[];
  body?: string[];
}

export interface LinkExtractor {
  urlPattern: string; // Regex to match link href
  queryParam?: string; // Query param key holding the tracking number
  regex?: string; // Regex to extract tracking number from URL string
}

export interface CourierRule {
  id: string;
  name: string;
  domains: string[];
  statusRules?: {
    delivered?: MatchRule;
    arriving?: MatchRule; // delivering
    exception?: MatchRule;
    sent?: MatchRule;
    ordered?: MatchRule;
  };
  tracking?: {
    patterns: string[];
    links?: LinkExtractor[];
  };
  // Optional custom JavaScript parser callback for complex HTML/DOM/date operations
  parse?: (email: EmailData, helpers: ParserHelpers) => MailPackageResult | null;
}

export interface ShipperRules {
	email: string[];
	subject?: string[];
	body?: string[];
	trackingPattern?: string[];
}
