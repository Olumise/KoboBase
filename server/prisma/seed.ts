import { prisma } from "../src/lib/prisma";

const categories = [
	// System categories - common expense categories
	{
		name: "Food & Dining",
		icon: "🍔",
		color: "#FF6B6B",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Transportation",
		icon: "🚗",
		color: "#4ECDC4",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Shopping",
		icon: "🛍️",
		color: "#95E1D3",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Entertainment",
		icon: "🎬",
		color: "#F38181",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Bills & Utilities",
		icon: "💡",
		color: "#AA96DA",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Healthcare",
		icon: "⚕️",
		color: "#FCBAD3",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Education",
		icon: "📚",
		color: "#A8D8EA",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Travel",
		icon: "✈️",
		color: "#FFD93D",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Salary",
		icon: "💰",
		color: "#6BCB77",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Investments",
		icon: "📈",
		color: "#4D96FF",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Gifts",
		icon: "🎁",
		color: "#FF85A2",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Subscriptions",
		icon: "📱",
		color: "#9381FF",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Personal Care",
		icon: "💅",
		color: "#FFB4B4",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Rent",
		icon: "🏠",
		color: "#F8AD9D",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Insurance",
		icon: "🛡️",
		color: "#74B9FF",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Data & Airtime",
		icon: "📱",
		color: "#4A90E2",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Betting & Gaming",
		icon: "🎲",
		color: "#E24A4A",
		isSystemCategory: true,
		isActive: true,
	},
	{
		name: "Generator & Fuel",
		icon: "⚡",
		color: "#FFB900",
		isSystemCategory: true,
		isActive: true,
	},
];

const seed = async () => {
	await prisma.category.deleteMany();
	await prisma.category.createMany({
		data: categories,
	});
};

seed();
