import type { ShipperRules } from "./types";

export const AMAZON_DOMAINS = [
	"amazon.com",
	"amazon.ca",
	"amazon.co.uk",
	"amazon.in",
	"amazon.de",
	"amazon.it",
	"amazon.com.au",
	"amazon.pl",
];

export const AMAZON_DELIVERED_SUBJECTS = [
	"Delivered: Your",
	"Consegna effettuata:",
	"Dostarczono:",
	"Geliefert:",
];

export const AMAZON_SHIPMENT_TRACKINGS = [
	"shipment-tracking",
	"conferma-spedizione",
];

export const AMAZON_EMAIL_PREFIX = "order-update@";

export const AMAZON_HUB_EMAIL = [
	"thehub@amazon.com",
	"order-update@amazon.com",
];
export const AMAZON_HUB_SUBJECT = "ready for pickup from Amazon Hub Locker";
export const AMAZON_HUB_SUBJECT_SEARCH =
	/(You have a package to pick up)(.*)(\d{6})/;
export const AMAZON_HUB_BODY = /(Your pickup code is <b>)(\d{6})/;

export const AMAZON_TIME_PATTERNS = [
	"will arrive:",
	"estimated delivery date is:",
	"guaranteed delivery date is:",
	"Arriving:",
	"Arriverà:",
	"arriving:",
	"Dostawa:",
	"Zustellung:",
];

export const AMAZON_EXCEPTION_SUBJECT = "Delivery update:";
export const AMAZON_EXCEPTION_BODY_MARKER = "running late";
export const AMAZON_ORDER_PATTERN = /[0-9]{3}-[0-9]{7}-[0-9]{7}/g;

export const SHIPPER_RULES_REGISTRY: Record<
	string,
	{
		delivered: ShipperRules;
		delivering: ShipperRules;
		tracking: { pattern: string[] };
	}
> = {
	usps: {
		delivered: {
			email: ["auto-reply@usps.com"],
			subject: ["Item Delivered"],
		},
		delivering: {
			email: ["auto-reply@usps.com"],
			subject: ["Expected Delivery on", "Out for Delivery"],
			body: ["Your item is out for delivery"],
		},
		tracking: {
			pattern: ["9[2345]\\d{15,26}"],
		},
	},
	ups: {
		delivered: {
			email: ["mcinfo@ups.com"],
			subject: [
				"Your UPS Package was delivered",
				"Your UPS Packages were delivered",
			],
		},
		delivering: {
			email: ["mcinfo@ups.com"],
			subject: [
				"UPS Update: Package Scheduled for Delivery Today",
				"UPS Update: Follow Your Delivery on a Live Map",
				"UPS Pre-Arrival: Your Driver is Arriving Soon! Follow on a Live Map",
			],
		},
		tracking: {
			pattern: ["1Z?[0-9A-Z]{16}"],
		},
	},
	fedex: {
		delivered: {
			email: ["TrackingUpdates@fedex.com", "fedexcanada@fedex.com"],
			subject: [
				"Your package has been delivered",
				"Your packages have been delivered",
			],
		},
		delivering: {
			email: ["TrackingUpdates@fedex.com", "fedexcanada@fedex.com"],
			subject: [
				"Delivery scheduled for today",
				"Your package is scheduled for delivery today",
				"Your package is now out for delivery",
				"out for delivery today",
			],
		},
		tracking: {
			pattern: ["\\d{12,20}"],
		},
	},
	capost: {
		delivered: {
			email: ["donotreply@canadapost.postescanada.ca"],
			subject: ["Delivery Notification"],
		},
		delivering: {
			email: ["donotreply@canadapost.postescanada.ca"],
		},
		tracking: {
			pattern: [],
		},
	},
	dhl: {
		delivered: {
			email: [
				"donotreply_odd@dhl.com",
				"NoReply.ODD@dhl.com",
				"noreply@dhl.de",
				"pl.no.reply@dhl.com",
			],
			subject: ["DHL On Demand Delivery", "Powiadomienie o przesyłce"],
			body: ["has been delivered", "została doręczona"],
		},
		delivering: {
			email: [
				"donotreply_odd@dhl.com",
				"NoReply.ODD@dhl.com",
				"noreply@dhl.de",
				"pl.no.reply@dhl.com",
			],
			subject: [
				"DHL On Demand Delivery",
				"paket kommt heute",
				"Powiadomienie o przesyłce",
			],
			body: [
				"scheduled for delivery TODAY",
				"zostanie dziś do Państwa doręczona",
			],
		},
		tracking: {
			pattern: ["\\d{10,11}"],
		},
	},
	hermes: {
		delivered: {
			email: ["donotreply@myhermes.co.uk"],
			subject: ["Hermes has successfully delivered your"],
		},
		delivering: {
			email: ["donotreply@myhermes.co.uk"],
			subject: ["parcel is now with your local Hermes courier"],
		},
		tracking: {
			pattern: ["\\d{16}"],
		},
	},
	royal: {
		delivered: {
			email: ["no-reply@royalmail.com"],
			subject: ["has been delivered"],
		},
		delivering: {
			email: ["no-reply@royalmail.com"],
			subject: ["is on its way", "to be delivered today"],
		},
		tracking: {
			pattern: ["[A-Za-z]{2}[0-9]{9}GB"],
		},
	},
	poczta_polska: {
		delivered: {
			email: [],
		},
		delivering: {
			email: ["informacja@poczta-polska.pl", "powiadomienia@allegromail.pl"],
			subject: ["Poczta Polska S.A. eINFO"],
		},
		tracking: {
			pattern: ["\\d{20}"],
		},
	},
	inpost_pl: {
		delivered: {
			email: [
				"powiadomienia@inpost.pl",
				"info@paczkomaty.pl",
				"powiadomienia@allegromail.pl",
			],
			subject: [
				"InPost - Potwierdzenie odbioru",
				"InPost - Paczka umieszczona w Paczkomacie",
			],
		},
		delivering: {
			email: [
				"powiadomienia@inpost.pl",
				"info@paczkomaty.pl",
				"powiadomienia@allegromail.pl",
			],
			subject: ["Kurier InPost: Twoja paczka jest w drodze", "prawie u Ciebie"],
		},
		tracking: {
			pattern: ["\\d{24}"],
		},
	},
	dpd_com_pl: {
		delivered: {
			email: [
				"KurierDPD0@dpd.com.pl",
				"KurierDPD1@dpd.com.pl",
				"KurierDPD2@dpd.com.pl",
				"KurierDPD3@dpd.com.pl",
				"KurierDPD4@dpd.com.pl",
				"KurierDPD5@dpd.com.pl",
				"KurierDPD6@dpd.com.pl",
				"KurierDPD7@dpd.com.pl",
				"KurierDPD8@dpd.com.pl",
				"KurierDPD9@dpd.com.pl",
				"KurierDPD10@dpd.com.pl",
				"powiadomienia@allegromail.pl",
			],
			subject: ["została doręczona"],
		},
		delivering: {
			email: [
				"KurierDPD0@dpd.com.pl",
				"KurierDPD1@dpd.com.pl",
				"KurierDPD2@dpd.com.pl",
				"KurierDPD3@dpd.com.pl",
				"KurierDPD4@dpd.com.pl",
				"KurierDPD5@dpd.com.pl",
				"KurierDPD6@dpd.com.pl",
				"KurierDPD7@dpd.com.pl",
				"KurierDPD8@dpd.com.pl",
				"KurierDPD9@dpd.com.pl",
				"KurierDPD10@dpd.com.pl",
				"powiadomienia@allegromail.pl",
			],
			subject: ["Bezpieczne doręczenie", "przesyłka została nadana"],
			body: ["Dziś doręczamy", "DPD Polska"],
		},
		tracking: {
			pattern: ["\\d{13}[A-Z0-9]{1,2}"],
		},
	},
	gls: {
		delivered: {
			email: ["noreply@gls-group.eu", "powiadomienia@allegromail.pl"],
			subject: ["informacja o dostawie"],
			body: ["została dzisiaj dostarczona"],
		},
		delivering: {
			email: ["noreply@gls-group.eu", "powiadomienia@allegromail.pl"],
			subject: ["paczka w drodze"],
			body: ["Zespół GLS"],
		},
		tracking: {
			pattern: ["\\d{11}"],
		},
	},
	auspost: {
		delivered: {
			email: ["noreply@notifications.auspost.com.au"],
			subject: ["Your shipment has been delivered"],
		},
		delivering: {
			email: ["noreply@notifications.auspost.com.au"],
			subject: ["is on its way", "is coming today"],
		},
		tracking: {
			pattern: ["\\d{7,10,12}|[A-Za-z]{2}[0-9]{9}AU "],
		},
	},
};
