import bcrypt from 'bcryptjs';

const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const checkPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Used when the email does not exist, so response time does not reveal valid emails.
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);