export class Cal3DObject {
	public filename: string;

	public constructor(xml: string, filename = '') {
		this.filename = filename;
	}

	private static deserialize(xml: string) {
		if (xml.length === 0) {
			return null;
		}
	}
}
