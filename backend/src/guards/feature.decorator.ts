export const RequireFeature = (feature: string) => {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    descriptor.value.requiredFeature = feature;
    return descriptor;
  };
};
