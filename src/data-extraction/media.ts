export interface ImageData {
	/** Image source URL. */
	src: string;
	alt: string;
	caption?: string;
}

export interface VideoData {
	text: string;
	label: string;
	title: string;
	/** Video destination URL. */
	url: string;
}
