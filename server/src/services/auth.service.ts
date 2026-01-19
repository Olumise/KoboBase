import { auth } from "../lib/auth";
export interface signUpType {
	email: string;
	password: string;
	name: string;
}

export const signUpUser = async (data: signUpType) => {
	const { email, password, name } = data;
	const { headers, response } = await auth.api.signUpEmail({
		returnHeaders: true,
		body: {
			email,
			password,
			name,
		},
	});
	return { headers, response };
};


export const signInUser = async (data: any) => {
	const { email, password } = data;
	try {
		const data = await auth.api.signInEmail({
			returnHeaders: true,
			body: {
				email,
				password,
			},
			
		});
		return data
	} catch (err: any) {
		throw new Error(err);
	}
};

export const getUser = async (headers: any) => {
	try {
		const user = await auth.api.getSession({
			headers,
		});
		return user;
	} catch (err: any) {
		throw new Error(err);
	}
};
