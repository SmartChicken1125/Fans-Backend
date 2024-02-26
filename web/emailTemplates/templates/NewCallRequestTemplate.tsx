import * as React from "react";
import FypBaseTemplate from "../components/FypBaseTemplate.js";

interface NewCallRequestTemplateProps {
	creatorName: string;
	fanName: string;
	date: string;
	time: string;
	duration: string;
	amount: string;
	responseLink: string; // Link for the creator to accept or reject the call request
}

export function NewCallRequestTemplate(props: NewCallRequestTemplateProps) {
	return (
		<FypBaseTemplate>
			<h1>New Video Call Request from {props.fanName}</h1>

			<div>Hello {props.creatorName},</div>
			<div style={{ marginTop: "20px" }}>
				{props.fanName} has requested a video call with you on{" "}
				{props.date} at {props.time} for {props.duration}. The call is
				priced at {props.amount}. Please click here to accept or reject
				this call request:{" "}
				<a href={props.responseLink}>Respond to Call Request</a>.
			</div>
			<div style={{ marginTop: "30px" }}>
				Best,
				<br />
				The FYP.Fans Team
			</div>
		</FypBaseTemplate>
	);
}
