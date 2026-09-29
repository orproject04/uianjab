import SignInForm from "../signin/SignInForm";

export const metadata = {
    title: "Admin Login",
    description: "Admin Login page",
};

export default function AdminLogin() {
    return (
        <>
            <SignInForm manual={true} />
        </>
    );
}
