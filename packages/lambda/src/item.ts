export const createNewItem = () => ({
	pk: "1",
	sk: new Date().toISOString(),
	val: Math.random() * 100,
});
