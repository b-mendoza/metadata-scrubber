const Schema = {
  decodeUnknownSync: () => (input: string) => input,
};

export const parse = (input: string) => Schema.decodeUnknownSync()(input);
